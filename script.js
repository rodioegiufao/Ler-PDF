// Acessando o módulo pdfjsLib
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';

// **CORREÇÃO CRUCIAL:** Configuração do Worker para pdf.js (versão modular .mjs)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

// Variáveis globais para armazenar os dados de ambos os arquivos
let extractedExcelData = '';
let extractedPdfText = '';

document.addEventListener('DOMContentLoaded', () => {
    // Referências do DOM
    const excelFileInput = document.getElementById('excelFileInput');
    const pdfFileInput = document.getElementById('pdfFileInput');
    const messages = document.getElementById('messages');
    const excelOutput = document.getElementById('excelOutput');
    const pdfOutput = document.getElementById('pdfOutput');
    const canvas = document.getElementById('pdfCanvas');
    const canvasContainer = document.getElementById('canvasContainer');
    const analyzeButton = document.getElementById('analyzeButton');
    const aiOutput = document.getElementById('aiOutput');

    // Ouvintes de Eventos
    excelFileInput.addEventListener('change', handleExcelFileUpload);
    pdfFileInput.addEventListener('change', handlePdfFileUpload);
    
    // Ouvinte para o botão de análise de IA
    analyzeButton.addEventListener('click', () => {
        if (extractedExcelData && extractedPdfText) {
            analyzeTextWithAI(extractedExcelData, extractedPdfText);
        } else {
            aiOutput.textContent = 'Certifique-se de que tanto o XLSX quanto o PDF foram carregados.';
        }
    });

    /**
     * Função para atualizar a mensagem de status
     */
    function updateMessage(text, isError = false) {
        messages.textContent = text;
        messages.style.backgroundColor = isError ? '#fdd' : '#fff8e1';
        console.log(text);
        checkAnalysisReadiness();
    }

    /**
     * Verifica se ambos os arquivos foram processados para habilitar o botão.
     */
    function checkAnalysisReadiness() {
        if (extractedExcelData && extractedPdfText) {
            analyzeButton.disabled = false;
            analyzeButton.textContent = '3. Analisar e Comparar com Gemini (PRONTO)';
        } else {
            analyzeButton.disabled = true;
            analyzeButton.textContent = '3. Analisar e Comparar com Gemini';
        }
    }

    /**
     * Função para ler o arquivo XLSX, extraindo as colunas D, E e F.
     */
    function handleExcelFileUpload(event) {
        const file = event.target.files[0];
        excelOutput.textContent = '';
        extractedExcelData = '';

        if (!file) {
            updateMessage('Nenhum arquivo XLSX selecionado.');
            return;
        }

        updateMessage(`... Carregando arquivo XLSX: ${file.name} ...`);

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                // XLSX.read é fornecido pela biblioteca SheetJS
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Assumindo que queremos a primeira aba
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                // Converte a planilha para uma matriz de arrays (sem usar cabeçalhos de coluna para garantir)
                const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                // CORREÇÃO APLICADA AQUI: 
                // Os dados de orçamento geralmente começam na 5ª linha (índice 4),
                // após cabeçalhos e metadados.
                const DATA_START_ROW_INDEX = 4; 

                // Processa os dados para extrair as colunas D (3), E (4) e F (5)
                let extractedDataArray = ['Descrição | Unidade | Quantidade']; 
                
                // Iterar sobre as linhas, começando pela linha de dados (índice 4)
                for (let i = DATA_START_ROW_INDEX; i < sheetData.length; i++) {
                    const row = sheetData[i];
                    
                    // Colunas no array sheetData: A=0, B=1, C=2, D=3, E=4, F=5...
                    const description = row[3] || ''; 
                    const unit = row[4] || '';
                    // Usar row[5] diretamente para capturar 0 e valores vazios
                    const quantity = row[5] !== undefined && row[5] !== null ? row[5] : ''; 
                    
                    // Apenas adiciona se houver conteúdo em uma das três colunas
                    if (description || unit || quantity) { 
                        extractedDataArray.push(`${description} | ${unit} | ${quantity}`);
                    }
                }

                // Remove a linha de cabeçalho da contagem
                const totalItems = extractedDataArray.length - 1; 

                if (totalItems > 0) {
                    extractedExcelData = extractedDataArray.join('\n');
                    excelOutput.textContent = extractedExcelData;
                    updateMessage(`... Leitura do XLSX concluída: ${totalItems} itens extraídos.`);
                } else {
                    extractedExcelData = '';
                    excelOutput.textContent = 'Erro: Nenhuma linha de dados encontrada a partir da 5ª linha. Verifique a estrutura do seu arquivo.';
                    updateMessage('... Erro de processamento: Nenhuma linha de dados encontrada.', true);
                }

            } catch (error) {
                extractedExcelData = '';
                excelOutput.textContent = 'Erro ao ler o arquivo XLSX. Verifique se o arquivo está no formato correto e se a biblioteca SheetJS foi carregada.';
                updateMessage(`... Erro ao processar XLSX: ${error.message}`, true);
                console.error('Erro de XLSX:', error);
            }
        };

        reader.readAsArrayBuffer(file);
    }

    /**
     * Função que gerencia o fluxo de leitura do arquivo PDF (Direto e OCR).
     */
    async function handlePdfFileUpload(event) {
        const file = event.target.files[0];
        pdfOutput.textContent = '';
        canvasContainer.style.display = 'none';
        extractedPdfText = '';

        if (!file) {
            updateMessage('Nenhum arquivo PDF selecionado.');
            return;
        }

        updateMessage(`... Processando arquivo PDF: ${file.name} ...`);

        try {
            const arrayBuffer = await file.arrayBuffer();

            // Tentar extração direta de texto (mais rápido e preciso)
            updateMessage('... Etapa 1/2: Tentando extração de texto direto...');
            let textDirect = await extractTextFromPDF(arrayBuffer);

            let finalExtractedText = textDirect;
            
            // Se a extração direta for muito curta, tentar OCR
            if (textDirect.length < 50) { 
                updateMessage('... Extração direta incompleta. Etapa 2/2: Executando OCR via Tesseract...');
                const ocrText = await extractTextFromOCR(arrayBuffer, canvas, canvasContainer);
                
                if (ocrText.length > textDirect.length) {
                     finalExtractedText = ocrText;
                     updateMessage('... OCR concluído e utilizado.');
                } else {
                    updateMessage('... OCR concluído, mas o texto direto foi mantido.');
                }
            } else {
                updateMessage('... Extração de texto direto concluída e utilizada. Pulando OCR.');
            }


            if (finalExtractedText) {
                extractedPdfText = finalExtractedText;
                pdfOutput.textContent = finalExtractedText;
                updateMessage('... Processamento do PDF concluído. Pronto para a análise de IA.');
            } else {
                pdfOutput.textContent = 'Não foi possível extrair nenhum texto do PDF.';
                updateMessage('... Erro no processamento do PDF: Nenhum texto extraído.', true);
            }

        } catch (error) {
            pdfOutput.textContent = `Erro durante o processamento do PDF: ${error.message}`;
            updateMessage(`... Erro no fluxo do PDF: ${error.message}`, true);
            console.error('Erro de PDF:', error);
        }
    }

    /**
     * Extrai texto de um PDF usando a API interna (texto selecionável).
     */
    async function extractTextFromPDF(arrayBuffer) {
        const pdfData = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        // Limitar a 5 páginas para evitar processamento muito longo no navegador
        const numPagesToProcess = Math.min(pdf.numPages, 5); 

        for (let i = 1; i <= numPagesToProcess; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(s => s.str).join(' ');
            fullText += pageText + '\n\n';
        }
        return fullText.trim();
    }
    
    /**
     * Extrai texto via OCR usando Tesseract.js (para PDFs escaneados/imagens).
     */
    async function extractTextFromOCR(arrayBuffer, canvas, canvasContainer) {
        const pdfData = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1); 

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvasContainer.style.display = 'block';

        const renderContext = {
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
        };
        await page.render(renderContext).promise;

        const imageURL = canvas.toDataURL('image/png');

        const { data: { text } } = await Tesseract.recognize(
            imageURL,
            'por', 
            { 
                logger: m => {
                    if (m.status === 'recognizing text') {
                        updateMessage(`... OCR: ${Math.round(m.progress * 100)}% concluído...`, false);
                    }
                }
            }
        );
        return text.trim();
    }


    /**
     * Função para enviar o texto extraído do XLSX e PDF para a API do Gemini.
     */
    async function analyzeTextWithAI(excelData, pdfText) {
        // 🚨 ALERTA: Substitua pela sua chave real!
        const GEMINI_API_KEY = 'SUA_CHAVE_DE_API_AQUI'; 
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        aiOutput.textContent = 'Executando análise de IA...';
        analyzeButton.disabled = true;

        const promptInstruction = `
            Você é um assistente de comparação de orçamentos. Sua tarefa é analisar e comparar dados de duas fontes:
            
            1. **LISTA DE ORÇAMENTO (XLSX):** Uma lista de itens no formato "Descrição | Unidade | Quantidade".
            2. **TEXTO DO DOCUMENTO (PDF):** O texto extraído de um documento técnico ou edital relacionado.
            
            **Instrução de Análise:**
            
            1.  **Validação Rápida:** Verifique se as descrições na LISTA DE ORÇAMENTO (XLSX) estão referenciadas ou são compatíveis com o contexto fornecido no TEXTO DO DOCUMENTO (PDF).
            2.  **Lista de Inconsistências:** Liste os 5 primeiros itens da LISTA DE ORÇAMENTO que *não* parecem ser mencionados ou que parecem ser incompatíveis com o TEXTO DO DOCUMENTO.
            3.  **Resumo de Relevância:** Forneça um resumo de 3 frases sobre a relevância do TEXTO DO DOCUMENTO para a LISTA DE ORÇAMENTO.
            
            ---
            
            **LISTA DE ORÇAMENTO (XLSX):**
            ${excelData}
            
            ---
            
            **TEXTO DO DOCUMENTO (PDF):**
            ${pdfText}
            
            ---
            
            **FORMATO DE SAÍDA REQUERIDO:**
            
            **Resumo de Relevância:** [Seu resumo aqui]
            
            **Inconsistências Notadas (Primeiros 5):**
            - [Descrição do item 1 do XLSX]
            - [Descrição do item 2 do XLSX]
            - [Descrição do item 3 do XLSX]
            - [Descrição do item 4 do XLSX]
            - [Descrição do item 5 do XLSX]
        `;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: promptInstruction
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.1, 
                        maxOutputTokens: 4096
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `Erro HTTP: ${response.status}. Verifique sua API Key, permissões e limites de uso.`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (aiResponseText) {
                aiOutput.textContent = aiResponseText;
            } else {
                aiOutput.textContent = "A IA não conseguiu gerar uma resposta. Resposta bruta: " + JSON.stringify(data, null, 2);
            }

        } catch (error) {
            aiOutput.textContent = `Erro na análise de IA: ${error.message}\n(Verifique se sua API Key está correta no script.js)`;
            console.error('Erro de API da IA:', error);
        } finally {
            analyzeButton.disabled = false;
        }
    }
});
