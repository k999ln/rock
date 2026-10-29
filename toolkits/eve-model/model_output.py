"""Exclude explicit internal-reasoning spans before writing experiment artifacts."""
import re

def allowed_output(raw):
    closed=re.compile(r'<(think|analysis|reasoning)\b[^>]*>.*?</\1\s*>',re.I|re.S)
    value,count=closed.subn('<think>[excluded reasoning]</think>',raw)
    # Unclosed internal spans have no accepted final answer in that suffix.
    value,open_count=re.subn(r'<(?:think|analysis|reasoning)\b[^>]*>(?!\[excluded reasoning\]).*$',
                            '<think>[excluded reasoning; incomplete span]</think>',value,flags=re.I|re.S)
    return value,bool(count or open_count)
