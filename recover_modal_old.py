import json

transcript_path = '/Users/rayan/.gemini/antigravity-ide/brain/5a51dcfc-753c-49e5-95e3-6ca13c25aa38/.system_generated/logs/transcript_full.jsonl'

with open(transcript_path, 'r') as f:
    lines = f.readlines()

for line in reversed(lines):
    try:
        data = json.loads(line)
        if 'tool_calls' in data:
            for tc in data['tool_calls']:
                if tc['name'] == 'write_to_file':
                    if 'GlobalRecordSaleModal.tsx' in tc['args'].get('TargetFile', ''):
                        print("Found write_to_file in previous session!")
                        with open('recovered_modal.tsx', 'w') as out:
                            out.write(tc['args']['CodeContent'])
                        exit(0)
    except Exception as e:
        pass
