import zipfile
import xml.etree.ElementTree as ET

try:
    with zipfile.ZipFile('Informe_Comparativo_Chatwoot_Cloud_vs_Railway.docx') as z:
        xml_content = z.read('word/document.xml')
        root = ET.fromstring(xml_content)
        # Extract text from all nodes
        texts = []
        for node in root.iter():
            if node.text:
                texts.append(node.text)
        print(' '.join(texts))
except Exception as e:
    print(f"Error: {e}")
