"""Parsers for UBOS release families.

UBOS workbooks are third-party files. .xlsx is XML inside, so parsing must be
protected against malicious XML (entity expansion "billion laughs", external
entities). openpyxl does this only when defusedxml is installed, so we refuse
to run without it.
"""

import openpyxl.xml

if not openpyxl.xml.DEFUSEDXML:
    raise ImportError("defusedxml is required to parse UBOS .xlsx files safely: pip install defusedxml")
