import sys
import re

def count_tags(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove strings and comments to avoid false positives
    content = re.sub(r'\{/\*.*?\*/\}', '', content, flags=re.DOTALL)
    content = re.sub(r'//.*', '', content)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    content = re.sub(r'\'[^\']*\'', '\'\'', content)
    content = re.sub(r'\"[^\"]*\"', '\"\"', content)
    content = re.sub(r'`[^`]*`', '``', content)

    # Find all JSX tags
    # This is a simplified regex but should work for identifying unmatched tags
    tags = re.findall(r'<(/?[a-zA-Z0-9\.]+)([^>]*?)(/?)>', content)
    
    stack = []
    for tag_name, attrs, self_closing in tags:
        if self_closing == '/' or tag_name.lower() in ['br', 'hr', 'img', 'input', 'meta', 'link']:
            continue
        
        if tag_name.startswith('/'):
            name = tag_name[1:]
            if not stack:
                print(f"Extra closing tag: </{name}>")
                continue
            last = stack.pop()
            if last != name:
                print(f"Mismatched tag: opened <{last}> but closed </{name}>")
                # Don't return, keep going to find others
        else:
            stack.append(tag_name)
    
    if stack:
        print("Unclosed tags:")
        for t in stack:
            print(f"  <{t}>")
    else:
        print("All tags balanced")

if __name__ == "__main__":
    count_tags(sys.argv[1])
