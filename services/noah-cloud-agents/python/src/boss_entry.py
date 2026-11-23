"""Keep the boss distribution in its own Worker isolate."""
from entry import Default, NoahPythonJob

NoahPythonJob.profile = 'boss'
