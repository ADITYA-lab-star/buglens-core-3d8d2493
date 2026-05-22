import requests

key = 'AIzaSyCNeoAEuihL7w1FSKq2RyHGlP8HSDCq8VE'
model = 'models/gemini-2.5-flash'
urls = [
    f'https://generativelanguage.googleapis.com/v1beta/{model}:generateText?key={key}',
    f'https://generativelanguage.googleapis.com/v1beta/{model}:streamingGenerateText?key={key}',
    f'https://generativelanguage.googleapis.com/v1beta/{model}:generateMessage?key={key}',
    f'https://generativelanguage.googleapis.com/v1beta/{model}:streamingGenerateMessage?key={key}',
]
payload = {'prompt': {'text': 'Hello'}, 'maxOutputTokens': 10}

for url in urls:
    r = requests.post(url, json=payload, timeout=20)
    print(url, r.status_code, r.text[:400])
