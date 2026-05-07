import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    line_no = 1
    col_no = 1
    
    for i, char in enumerate(content):
        if char == '\n':
            line_no += 1
            col_no = 1
            continue
        
        if char in '{[(':
            stack.append((char, line_no, col_no))
        elif char in '}])':
            if not stack:
                print(f"Extra closing {char} at line {line_no}, col {col_no}")
                return
            last, l, c = stack.pop()
            if (last == '{' and char != '}') or \
               (last == '[' and char != ']') or \
               (last == '(' and char != ')'):
                print(f"Mismatched {last} at line {l}, col {c} with {char} at line {line_no}, col {col_no}")
                return
        
        col_no += 1
    
    if stack:
        for char, line, col in stack:
            print(f"Unclosed {char} starting at line {line}, col {col}")
    else:
        print("Braces are balanced")

if __name__ == "__main__":
    check_braces(sys.argv[1])
