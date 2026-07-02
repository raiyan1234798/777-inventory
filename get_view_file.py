import json
transcript_path = '/Users/rayan/.gemini/antigravity-ide/brain/c63916d7-1e2b-4988-8c34-e276e56d4818/.system_generated/logs/transcript_full.jsonl'
with open(transcript_path, 'r') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'TOOL_RESPONSE' and data.get('source') == 'SYSTEM':
                content = data.get('content', '')
                if 'GlobalRecordSaleModal.tsx' in content and 'Total Lines:' in content:
                    print(content)
        except Exception as e:
            pass
