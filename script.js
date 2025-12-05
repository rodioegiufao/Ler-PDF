// Acessando o módulo pdfjsLib
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';

// **CORREÇÃO DEFINITIVA:** Apontamos para o worker.js na mesma versão.
// (Usaremos o .mjs para garantir a compatibilidade com a importação modular)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs'; // <--- Mudamos a extensão para .mjs

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
            // Adicionamos o separador de página
            fullText += pageText.trim() + '\n\n-- Página ' + i + ' --\n\n';
        }
        return fullText.trim(); // Retorna o texto de todas as páginas
    }

    /**
     * Realiza OCR em um PDF (que é tratado como imagem).
     */
    // ... (dentro de script.js)

    /**
     * Realiza OCR em um PDF, processando todas as páginas.
     */
    async function performOCR(arrayBuffer) {
        updateMessage('... Etapa de OCR: Renderizando PDF para Canvas...', false);
        
        const pdfData = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;

        let fullOCRText = '';

        // O loop agora processa TODAS as páginas
        for (let i = 1; i <= pdf.numPages; i++) {
            updateMessage(`... Etapa de OCR: Processando Página ${i} de ${pdf.numPages}...`, false);
            const page = await pdf.getPage(i);

            // 1. Renderizar a página atual do PDF no Canvas
            const viewport = page.getViewport({ scale: 2.0 }); // Aumentamos a escala para 2.0 para melhor precisão do OCR
            
            // O Canvas precisa ter o tamanho da página atual
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Mostramos o canvas apenas para fins de depuração na primeira página
            if (i === 1) { 
                canvasContainer.style.display = 'block'; 
            } else {
                canvasContainer.style.display = 'none'; // Esconde páginas subsequentes para evitar poluição visual
            }
            
            const renderContext = {
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            };
            await page.render(renderContext).promise;

            // 2. Converter o Canvas em uma URL de Imagem (Data URL)
            const imageURL = canvas.toDataURL('image/png');

            // 3. Executar o Tesseract OCR na imagem
            updateMessage(`... OCR na Página ${i}: Executando Tesseract (Pode demorar)...`, false);
            
            // A flag 'Tesseract' precisa estar disponível globalmente
            const { data: { text } } = await Tesseract.recognize(
                imageURL,
                'por', // Configurado para Português
                { 
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            updateMessage(`... OCR na Pág ${i}: ${Math.round(m.progress * 100)}% concluído...`, false);
                        }
                    } 
                }
            );

            // Adicionar o texto da página atual e o separador
            fullOCRText += text.trim() + '\n\n-- Página ' + i + ' (OCR) --\n\n';
        }

        return fullOCRText.trim();
    }

});



