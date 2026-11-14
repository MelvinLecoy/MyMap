"""Apply approved country stays without changing city data or country metadata."""
import csv
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

root=Path(__file__).resolve().parents[1]
ledger=json.loads((root/'data/sources/country-visit-updates-2026-11-14.json').read_text())
def read(name):
    p=root/name
    with p.open(encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f);return reader.fieldnames,list(reader)
def write(name,headers,rows):
    p=root/name;encoding='utf-8-sig' if p.read_bytes().startswith(b'\xef\xbb\xbf') else 'utf-8'
    with p.open('w',encoding=encoding,newline='') as f:
        w=csv.DictWriter(f,fieldnames=headers,lineterminator='\n');w.writeheader();w.writerows(rows)
def number(value):return format(Decimal(str(value)).normalize(),'f')
def duration(period):
    return Decimal(period['DaysSpent']) if period['DaysSpent'] else Decimal((date.fromisoformat(period['DepartureDate'])-date.fromisoformat(period['ArrivalDate'])).days+1)
ch,countries=read('data/countries.csv');vh,visits=read('data/country-visit-history.csv');ph,periods=read('data/country-visit-periods.csv')
codes={c['code'] for c in ledger['changes']};new_visits={};new_periods={}
for country in countries:
    code=country['CountryCode']
    if code not in codes:continue
    assert country['VisitStatus']=='visited'
    original_visits={(v['ArrivalDate'],v['DepartureDate']):v for v in visits if v['CountryCode']==code}
    stays={p['ArrivalDate']:dict(p) for p in periods if p['CountryCode']==code}
    for change in (c for c in ledger['changes'] if c['code']==code):
        start,end=change['arrival'],change['departure'];days=Decimal(str(change['days']))
        span=(date.fromisoformat(end)-date.fromisoformat(start)).days+1
        assert days>0 and days*2==int(days*2) and days<=span
        old=stays.get(start)
        if change['mode']=='replace':assert old is not None,(code,start)
        if old and change['mode']=='add':
            assert old['DepartureDate']==end and duration(old)==days,(code,start)
            continue
        row=dict(old) if old else {h:'' for h in ph}
        row.update(CountryCode=code,Country=country['Country'],ArrivalDate=start,DepartureDate=end,DaysSpent=number(days))
        refs=[r for r in row['SourceRefs'].split(';') if r]
        source='Owner chat '+ledger['approvedOn']
        if source not in refs:refs.append(source)
        row['SourceRefs']=';'.join(refs);stays[start]=row
    groups=[]
    for stay in sorted(stays.values(),key=lambda p:p['ArrivalDate']):
        if groups:
            gap=(date.fromisoformat(stay['ArrivalDate'])-date.fromisoformat(groups[-1][-1]['DepartureDate'])).days
            assert gap>0,(code,'overlapping stays')
        if not groups or gap>=ledger['visitGapDays']:groups.append([])
        groups[-1].append(stay)
    new_visits[code]=[];new_periods[code]=[]
    for index,group in enumerate(groups,start=1):
        start,end=group[0]['ArrivalDate'],group[-1]['DepartureDate']
        old=original_visits.get((start,end))
        prior=next((v for v in ledger['before']['visits'] if v['country_code']==code and v['arrival_date']==start),None)
        notes=old['Notes'] if old else (prior['notes'] if prior else '')
        if prior and not notes:notes=prior['notes']
        v={h:'' for h in vh}
        v.update(CountryCode=code,Country=country['Country'],VisitNumber=str(index),ArrivalDate=start,DepartureDate=end,DaysSpent=number(sum(duration(p) for p in group)),Notes=notes)
        new_visits[code].append(v)
        for j,p in enumerate(group,start=1):p.update(VisitNumber=str(index),PeriodNumber=str(j));new_periods[code].append(p)
    country['RecordedVisits']=str(len(groups))
    country['RecordedDaysSpent']=number(sum(duration(p) for p in stays.values()))
def replace_groups(rows,replacements):
    result=[];done=set()
    for row in rows:
        code=row['CountryCode']
        if code not in codes:result.append(row)
        elif code not in done:result.extend(replacements[code]);done.add(code)
    for code in sorted(codes-done):result.extend(replacements[code])
    return result
visits=replace_groups(visits,new_visits);periods=replace_groups(periods,new_periods)
assert len(visits)==ledger['expected']['visitRows'] and len(periods)==ledger['expected']['periods']
assert sum(Decimal(c['RecordedDaysSpent'] or 0) for c in countries)==Decimal(str(ledger['expected']['days']))
for name,headers,rows in [('data/countries.csv',ch,countries),('data/country-visit-history.csv',vh,visits),('data/country-visit-periods.csv',ph,periods)]:write(name,headers,rows)
for source,target in [('countries.csv','countries-template.csv'),('country-visit-history.csv','country-visits-template.csv'),('country-visit-periods.csv','country-visit-periods-template.csv')]:
    (root/'data/templates'/target).write_bytes((root/'data'/source).read_bytes())
print(json.dumps({'countryVisits':len(visits),'periods':len(periods),'days':ledger['expected']['days'],'countries':{c['CountryCode']:[int(c['RecordedVisits']),float(c['RecordedDaysSpent'])] for c in countries if c['CountryCode'] in codes}}))
