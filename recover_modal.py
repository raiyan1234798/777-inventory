import json

transcript_path = '/Users/rayan/.gemini/antigravity-ide/brain/c63916d7-1e2b-4988-8c34-e276e56d4818/.system_generated/logs/transcript_full.jsonl'

with open(transcript_path, 'r') as f:
    lines = f.readlines()

for line in reversed(lines):
    try:
        data = json.loads(line)
        if 'tool_calls' in data:
            for tc in data['tool_calls']:
                if tc['name'] == 'replace_file_content':
                    if 'GlobalRecordSaleModal.tsx' in tc['args'].get('TargetFile', ''):
                        if 'recordSaleGroups' in tc['args'].get('Instruction', '') or 'recordSaleGroups' in tc['args'].get('ReplacementContent', ''):
                            print("Found replace_file_content!")
                            print(tc['args']['Instruction'])
                if tc['name'] == 'write_to_file':
                    if 'GlobalRecordSaleModal.tsx' in tc['args'].get('TargetFile', ''):
                        print("Found write_to_file!")
                        with open('recovered_modal.tsx', 'w') as out:
                            out.write(tc['args']['CodeContent'])
                        exit(0)
    except:
        pass
