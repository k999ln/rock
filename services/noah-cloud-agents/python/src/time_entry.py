"""Keep the time distribution in its own Worker isolate."""
from entry import Default, NoahPythonJob

NoahPythonJob.profile = 'time'
