"""Transcribe the owner-verified workbook; formulas and other cell text are data only."""
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

import openpyxl

source = Path('data/sources/expanded_cities_visit_data_verified.xlsx')
workbook = openpyxl.load_workbook(source, data_only=True)
rows = list(csv.DictReader(Path('data/cities.csv').open()))
normalize = lambda s: ''.join(c for c in unicodedata.normalize('NFKD', s).lower() if c.isalnum() and not unicodedata.combining(c))
aliases = {'Siem Reap': 'krong-siem-reap-cambodia', 'Tromsø': 'tromso-norway'}
codes = {'Kyrgyzstan':'KG','Georgia':'GE','Bosnia and Herzegovina':'BA','Cambodia':'KH','Azerbaijan':'AZ','Uzbekistan':'UZ','Bolivia':'BO','Greece':'GR','United States':'US','Ecuador':'EC','Belgium':'BE','Norway':'NO','Oman':'OM','Argentina':'AR','Brazil':'BR','Italy':'IT','Fiji':'FJ','Costa Rica':'CR','Egypt':'EG','Saudi Arabia':'SA'}
manifest = Path('data/sources/city-visit-batches.json')
previous = json.loads(manifest.read_text()) if manifest.exists() else {'batches': []}
coordinate_file = Path('.cache/expanded-city-coordinates.json')
locations = json.loads(coordinate_file.read_text()) if coordinate_file.exists() else next(b['coordinateSource']['cities'] for b in previous['batches'] if b['id']=='expanded-cities-verified')
coordinates = {r['name']: r for r in locations}
new_cities = []
for name, city_id in [('Niagara Falls','niagara-falls-usa'),('Detroit','detroit-usa')]:
    location = coordinates[name]
    row = dict(cityid=city_id,cities=name,country='USA',countrycode='US',continent='America',region='North America',subregion='',status='Not Started',link='',visited='No',latitude=str(location['latitude']),longitude=str(location['longitude']))
    new_cities.append(row)
    if not any(r['CityId'] == city_id for r in rows):
        rows.append({'Cities':name,'CityId':city_id,'CountryCode':'US'})

summaries = {}
for _,name,country,display,total in list(workbook['21-city summary'].values)[1:-1]:
    segments=[]
    for token in display.split(','):
        match = re.fullmatch(r'\s*(\d{4}-\d{2}-\d{2})(?: to (\d{4}-\d{2}-\d{2}))? \((\d+(?:\.5)?)d\)\s*', token)
        if not match: raise ValueError(f'Unrecognized visit text: {token}')
        start,end,days=match.groups(); days=float(days)
        end=end or (dt.date.fromisoformat(start)+dt.timedelta(days=math.ceil(days)-1)).isoformat()
        segments.append(dict(start=start,end=end,days=days))
    assert sum(s['days'] for s in segments)==float(total),name
    summaries[(name,country)]=segments

by_city={}
for index,(name,country,number,start,end,days) in enumerate(list(workbook['26 individual visits'].values)[1:-1],start=2):
    assert isinstance(days,(int,float)) and days>0 and days*2==int(days*2)
    start=dt.date.fromisoformat(start)
    departure=dt.date.fromisoformat(end) if end else start+dt.timedelta(days=math.ceil(days)-1)
    assert start<=departure and days<=(departure-start).days+1
    matches=[r for r in rows if r['CountryCode']==codes[country] and (r['CityId']==aliases[name] if name in aliases else normalize(r['Cities'])==normalize(name))]
    assert len(matches)==1,(name,matches)
    city=matches[0]
    item=by_city.setdefault(city['CityId'],dict(city=city['Cities'],sourceCity=name,city_id=city['CityId'],country_code=codes[country],visits=[],sourceRows=[]))
    assert number==len(item['visits'])+1
    item['visits'].append(dict(start=start.isoformat(),end=departure.isoformat(),days=days))
    item['sourceRows'].append(index)
for item in by_city.values():
    country=next(country for (name,country) in summaries if name==item['sourceCity'])
    assert item['visits']==summaries[(item['sourceCity'],country)],item['city']
assert len(by_city)==21 and sum(len(c['visits']) for c in by_city.values())==26
assert sum(v['days'] for c in by_city.values() for v in c['visits'])==40
batch=dict(id='expanded-cities-verified',sourceFile=source.name,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),dateInterpretation='Inclusive calendar dates; duration-only entries end start + ceil(days) - 1. Explicit departure dates and half-day durations are retained. Comma-separated stays are grouped by the city six-day rule.',expected=dict(cities=21,stays=26,visits=25,days=40),newCities=new_cities,coordinateSource=dict(dataset='GeoNames cities500 via geonamescache 3.0.2',cities=list(coordinates.values())),cities=list(by_city.values()))
manifest=Path('data/sources/city-visit-batches.json')
data=json.loads(manifest.read_text()) if manifest.exists() else {'batches':[]}
if any(b['id']==batch['id'] for b in data['batches']):
    data['batches'] = [batch if b['id']==batch['id'] else b for b in data['batches']]
else:
    data['batches'].append(batch)
data.setdefault('expectedCollection', dict(cities=90,visits=137,stays=150,days=306.5,entries=327))
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'batch':batch['expected'],'collection':data['expectedCollection']}))
