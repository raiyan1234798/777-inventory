import json

paths = [
    '/Users/rayan/.gemini/antigravity-ide/brain/5a51dcfc-753c-49e5-95e3-6ca13c25aa38/.system_generated/logs/transcript_full.jsonl',
    '/Users/rayan/.gemini/antigravity-ide/brain/c63916d7-1e2b-4988-8c34-e276e56d4818/.system_generated/logs/transcript_full.jsonl'
]

for path in paths:
    print(f"--- {path} ---")
    try:
        with open(path, 'r') as f:
            for line in f:
                data = json.loads(line)
                if 'tool_calls' in data:
                    for tc in data['tool_calls']:
                        if tc['name'] == 'multi_replace_file_content':
                            if 'GlobalRecordSaleModal.tsx' in tc['args'].get('TargetFile', ''):
                                print("multi_replace:", tc['args'].get('Instruction', ''))
    except Exception as e:
        print("Error:", e)
