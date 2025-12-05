// Acessando o módulo pdfjsLib (precisa do type="module" no script tag do HTML)
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const messages = document.getElementById('messages');
    const output = document.getElementById('output');
    const canvas = document.getElementById('pdfCanvas');
    const canvasContainer = document.getElementById('canvasContainer');

    fileInput.addEventListener('change', handleFileUpload);

    /**
     * Atualiza a área de mensagens e o log
     */
    function updateMessage(text, isError = false) {
        messages.textContent = text;
        messages.style.backgroundColor = isError ? '#fdd' : '#fff8e1';
        console.log(text);
    }

    /**
     * Função principal que gerencia o fluxo de leitura do arquivo.
     */
    async function handleFileUpload(event) {
        const file = event.target.files[0];
        output.textContent = '';
        canvasContainer.style.display = 'none';

        if (!file || file.type !== 'application/pdf') {
            updateMessage('Por favor, selecione um arquivo PDF válido.', true);
            return;
        }

        updateMessage('Carregando PDF...', false);

        try {
            // 1. Carregar o arquivo como ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // 2. Tentar Extração Direta (Texto Interno do PDF)
            let extractedText = await extractTextFromPDF(arrayBuffer);

            if (extractedText && extractedText.trim().length > 0) {
                updateMessage('✅ Extração Direta (Texto Interno do PDF) realizada com sucesso.', false);
                output.textContent = extractedText;
            } else {
                updateMessage('⚠️ Texto direto vazio ou não encontrado. Iniciando OCR (Reconhecimento de Imagem)...', false);
                
                // 3. Se a extração direta falhar, realizar o OCR
                extractedText = await performOCR(arrayBuffer);

                if (extractedText && extractedText.trim().length > 0) {
                    updateMessage('✅ OCR concluído com sucesso.', false);
                    output.textContent = extractedText;
                } else {
                    updateMessage('❌ OCR não conseguiu extrair texto.', true);
                    output.textContent = 'Não foi possível extrair o texto de forma direta ou por OCR.';
                }
            }
        } catch (error) {
            updateMessage(`❌ Erro fatal: ${error.message}`, true);
            console.error(error);
        }
    }

    /**
     * Tenta extrair o texto do PDF usando a API interna do pdf.js.
     */
    async function extractTextFromPDF(arrayBuffer) {
        const pdfData = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;

        // Itera sobre todas as páginas
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Junta os itens de texto para formar o conteúdo da página
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n-- Página ' + i + ' --\n\n';
        }
        return fullText;
    }

    /**
     * Realiza OCR em um PDF (que é tratado como imagem).
     */
    async function performOCR(arrayBuffer) {
        updateMessage('... Etapa de OCR: Renderizando PDF para Canvas...', false);
        
        // 1. Renderizar a primeira página do PDF no Canvas
        const pdfData = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1); // Focamos apenas na primeira página para simplificar

        const viewport = page.getViewport({ scale: 1.5 }); // Aumentar a escala melhora o OCR
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvasContainer.style.display = 'block';

        const renderContext = {
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
        };
        await page.render(renderContext).promise;

        // 2. Converter o Canvas em uma URL de Imagem (Data URL)
        const imageURL = canvas.toDataURL('image/png');

        // 3. Executar o Tesseract OCR na imagem
        updateMessage('... Etapa de OCR: Executando Tesseract (Pode demorar)...', false);
        const { data: { text } } = await Tesseract.recognize(
            imageURL,
            'por', // Você pode mudar a linguagem, ex: 'eng' para Inglês
            { 
                logger: m => {
                    if (m.status === 'recognizing text') {
                        updateMessage(`... OCR: ${Math.round(m.progress * 100)}% concluído...`, false);
                    }
                } 
            }
        );

        return text;
    }
});