import os
from pathlib import Path
from talentlens.parser import ResumeParser
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)

def test_parsing():
    parser = ResumeParser()
    mock_dir = Path("../mock_resumes")
    
    if not mock_dir.exists():
        print(f"Directory {mock_dir.absolute()} does not exist.")
        return

    files = list(mock_dir.glob("*.pdf"))
    if not files:
        print("No PDF files found in mock_resumes.")
        return

    for pdf_file in files[:3]: # Test first 3
        print(f"\n--- Testing: {pdf_file.name} ---")
        try:
            with open(pdf_file, "rb") as f:
                content = f.read()
                text = parser.extract_text_from_bytes(pdf_file.name, content)
                print(f"Extracted text length: {len(text)}")
                
                parsed = parser.parse(pdf_file.name, text)
                print(f"Parsed Name: {parsed.name}")
                print(f"Parsed Email: {parsed.email}")
                print(f"Parsed Skills: {parsed.skills}")
                print(f"Missing Info: {parsed.missing_info_flags}")
        except Exception as e:
            print(f"Error parsing {pdf_file.name}: {str(e)}")

if __name__ == "__main__":
    test_parsing()
