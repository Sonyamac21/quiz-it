import re

files = [
    "app/host/display/page.tsx",
    "app/host/quiz/page.tsx",
    "components/PlayerQuizScreen.tsx",
]

pattern = re.compile(r'\{question\.question_text\}')
pattern2 = re.compile(r'\{currentQ\.question_text\}')

strip_expr = '{question.question_text.replace(/^Play this track:\\s*/i, "").replace(/^Show teams this image:\\s*/i, "")}'
strip_expr_currentQ = '{currentQ.question_text.replace(/^Play this track:\\s*/i, "").replace(/^Show teams this image:\\s*/i, "")}'

for path in files:
    with open(path, "r") as f:
        content = f.read()
    before = content
    content = pattern.sub(lambda m: strip_expr, content)
    content = pattern2.sub(lambda m: strip_expr_currentQ, content)
    changed = content != before
    print(path, "changed:", changed)
    with open(path, "w") as f:
        f.write(content)
