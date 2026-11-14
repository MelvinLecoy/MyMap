"""Transcribe the supplied 81-city workbook as data; retain source and identity matches."""
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata
import zipfile
import openpyxl

source = Path('data/sources/yellow_cities_81_visit_data.xlsx')
manifest = Path('data/sources/city-visit-batches.json')
data = json.loads(manifest.read_text())
rows = list(csv.DictReader(Path('data/cities.csv').open(encoding='utf-8-sig')))
normalize = lambda s: ''.join(c for c in unicodedata.normalize('NFKD',s).lower().replace('ł','l').replace('ø','o') if c.isalnum() and not unicodedata.combining(c))
countries = {normalize(r['Country']): r['CountryCode'] for r in csv.DictReader(Path('data/countries.csv').open(encoding='utf-8-sig'))}
countries[normalize('Bosnia and Herzegovina')] = 'BA'
new_names = [('Basel','CH'),('Bath','GB'),('Como','IT'),('Gold Coast','AU'),('Interlaken','CH'),('Jerash','JO'),('Johor Bahru','MY'),('Cologne','DE'),('Kunming','CN'),('Lugano','CH'),('Portsmouth','GB'),('Southampton','GB'),('Sunshine Coast','AU')]
previous = next((b for b in data['batches'] if b['id']=='yellow-cities-81'),None)
if previous:
    new_cities = previous['newCities']
    locations = previous['coordinateSource']['cities']
else:
    with zipfile.ZipFile('.cache/expanded-city-geonames.whl') as archive:
        cities = json.loads(archive.read(next(n for n in archive.namelist() if n.endswith('/cities500.json'))))
    new_cities, locations = [], []
    for name,code in new_names:
        candidates = [v for v in cities.values() if v['countrycode']==code and any(normalize(name)==normalize(n) for n in [v['name']]+v.get('alternatenames',[]))]
        assert len(candidates)==1,(name,candidates)
        place = candidates[0]
        locations.append({k:place[k] for k in ['geonameid','name','countrycode','latitude','longitude','population']})
        country = next(r for r in rows if r['CountryCode']==code)
        city_id = re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',name+' '+country['Country']).encode('ascii','ignore').decode().lower()).strip('-')
        new_cities.append(dict(cityid=city_id,cities=name,country=country['Country'],countrycode=code,continent=country['Continent'],region=country['Region'],subregion='',status='Not Started',link='',visited='No',latitude=str(place['latitude']),longitude=str(place['longitude'])))
for row in new_cities:
    if not any(r['CityId']==row['cityid'] for r in rows):
        rows.append({'CityId':row['cityid'],'Cities':row['cities'],'CountryCode':row['countrycode']})

book = openpyxl.load_workbook(source,data_only=True)
summaries = {}
for _,name,country,display,total in list(book['81-city summary'].values)[1:-1]:
    stays = []
    for token in display.split(','):
        match = re.fullmatch(r'\s*(\d{4}-\d{2}-\d{2})(?: to (\d{4}-\d{2}-\d{2}))? \((\d+(?:\.5)?)d\)\s*',token)
        if not match: raise ValueError(f'Unrecognized visit: {token}')
        start,end,days = match.groups(); days=float(days)
        end = end or (dt.date.fromisoformat(start)+dt.timedelta(days=math.ceil(days)-1)).isoformat()
        stays.append(dict(start=start,end=end,days=days))
    assert sum(v['days'] for v in stays)==total,name
    summaries[(name,country)] = stays
by_city = {}
for index,(name,country,number,start,end,days) in enumerate(list(book['82 individual visits'].values)[1:-1],start=2):
    assert isinstance(days,(int,float)) and days>0 and days*2==int(days*2)
    start = dt.date.fromisoformat(start)
    end = dt.date.fromisoformat(end) if end else start+dt.timedelta(days=math.ceil(days)-1)
    assert start<=end and days<=(end-start).days+1
    code = countries[normalize(country)]
    variants = [name]+re.findall(r'\(([^)]+)\)',name)+[re.sub(r'\s*\(.*\)','',name)]
    candidates = [r for r in rows if r['CountryCode']==code and (r['CityId']=='andorra-la-vella-andorra' if name=='Andorra' else normalize(r['Cities']) in [normalize(n) for n in variants])]
    assert len(candidates)==1,(name,candidates)
    city = candidates[0]
    item = by_city.setdefault(city['CityId'],dict(city=city['Cities'],sourceCity=name,city_id=city['CityId'],country_code=code,visits=[],sourceRows=[]))
    assert number==len(item['visits'])+1
    item['visits'].append(dict(start=start.isoformat(),end=end.isoformat(),days=days))
    item['sourceRows'].append(index)
for item in by_city.values():
    country = next(c for (n,c) in summaries if n==item['sourceCity'])
    assert item['visits']==summaries[(item['sourceCity'],country)],item['city']
assert len(by_city)==81 and sum(len(c['visits']) for c in by_city.values())==82
assert sum(v['days'] for c in by_city.values() for v in c['visits'])==87
batch = dict(id='yellow-cities-81',sourceFile=source.name,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),dateInterpretation='Inclusive dates; duration-only departures use arrival + ceil(days) - 1. Commas separate stays, then apply the existing six-day city visit rule.',expected=dict(cities=81,stays=82,visits=82,days=87),newCities=new_cities,coordinateSource=dict(dataset='GeoNames cities500 via geonamescache 3.0.2',cities=locations),notes=['Andorra matches Andorra la Vella.','Parenthetical names and diacritics match existing stable city IDs.','The newly supplied Southampton stay is 22-25 December 2023 (4 days); it supersedes exclusion of the older screenshot entry.'],cities=list(by_city.values()))
if any(b['id']==batch['id'] for b in data['batches']):
    data['batches'] = [batch if b['id']==batch['id'] else b for b in data['batches']]
else:
    data['batches'].append(batch)
if previous is None:
    data['expectedCollection'] = dict(cities=171,visits=219,stays=232,days=393.5,entries=340)
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'batch':batch['expected'],'newCities':[c['cities'] for c in new_cities],'collection':data['expectedCollection']},ensure_ascii=False))
