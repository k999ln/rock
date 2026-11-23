"""Keep the hermes distribution in its own Worker isolate."""
from entry import Default, NoahPythonJob

NoahPythonJob.profile = 'hermes'
