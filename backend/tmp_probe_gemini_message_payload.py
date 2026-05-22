import requests
key='AIzaSyCNeoAEuihL7w1FSKq2RyHGlP8HSDCq8VE'
model='gemini-2.5-flash'
base='https://generativelanguage.googleapis.com/v1beta/models'
payload={'model': model, 'messages':[{'author':'user','content':[{'type':'text','text':'Hello'}]}], 'temperature':0.3, 'maxOutputTokens':10}
for action in ['generateMessage', 'streamingGenerateMessage']:
    url=f'{base}/{model}:{action}?key={key}'
    print('URL', url)
    r=requests.post(url, json=payload, timeout=20)
    print('STATUS', r.status_code)
    print('HEADERS', dict(r.headers))
    print('TEXT', r.text[:2000])
    print('---')
