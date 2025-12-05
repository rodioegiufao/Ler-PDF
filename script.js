// Acessando o módulo pdfjsLib
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';

// **CORREÇÃO CRUCIAL:** Configuração do Worker para pdf.js (versão modular .mjs)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

document.addEventListener('DOMContentLoaded', () => {
    // Referências do DOM
    const fileInput = document.getElementById('fileInput');
    const messages = document.getElementById('messages');
    const output = document.getElementById('output');
    const canvas = document.getElementById('pdfCanvas');
    const canvasContainer = document.getElementById('canvasContainer');
    const analyzeButton = document.getElementById('analyzeButton'); // Adicionado
    const aiOutput = document.getElementById('aiOutput');           // Adicionado

    // Ouvintes de Eventos
    fileInput.addEventListener('change', handleFileUpload);
    
    // Novo ouvinte para o botão de análise de IA
    analyzeButton.addEventListener('click', () => {
        const textToAnalyze = analyzeButton.dataset.text;
        if (textToAnalyze) {
            analyzeTextWithAI(textToAnalyze);
        } else {
            aiOutput.textContent = 'Nenhum texto extraído para analisar.';
        }
    });

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
        aiOutput.textContent = 'Aguardando texto para análise...';
        analyzeButton.disabled = true; // Desabilita o botão até ter texto

        if (!file || file.type !== 'application/pdf') {
            updateMessage('Por favor, selecione um arquivo PDF válido.', true);
            return;
        }

        updateMessage('Carregando PDF...', false);
        let finalExtractedText = '';

        try {
            // 1. Carregar o arquivo como ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // 2. Tentar Extração Direta (Texto Interno do PDF)
            let extractedText = await extractTextFromPDF(arrayBuffer);

            if (extractedText && extractedText.trim().length > 0) {
                updateMessage('✅ Extração Direta (Texto Interno do PDF) realizada com sucesso.', false);
                finalExtractedText = extractedText;
            } else {
                updateMessage('⚠️ Texto direto vazio ou não encontrado. Iniciando OCR (Reconhecimento de Imagem)...', false);
                
                // 3. Se a extração direta falhar, realizar o OCR em todas as páginas
                extractedText = await performOCR(arrayBuffer);

                if (extractedText && extractedText.trim().length > 0) {
                    updateMessage('✅ OCR concluído com sucesso.', false);
                    finalExtractedText = extractedText;
                } else {
                    updateMessage('❌ OCR não conseguiu extrair texto.', true);
                    output.textContent = 'Não foi possível extrair o texto de forma direta ou por OCR.';
                }
            }
        } catch (error) {
            updateMessage(`❌ Erro fatal: ${error.message}`, true);
            console.error(error);
        }

        // Exibir e preparar para a IA
        if (finalExtractedText) {
            output.textContent = finalExtractedText;
            analyzeButton.disabled = false;
            analyzeButton.dataset.text = finalExtractedText; 
        }
    }

    /**
     * Tenta extrair o texto do PDF usando a API interna do pdf.js (todas as páginas).
     */
    async function extractTextFromPDF(arrayBuffer) {
        const pdfData = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText.trim() + '\n\n-- Página ' + i + ' (Direta) --\n\n';
        }
        return fullText.trim();
    }

    /**
     * Realiza OCR em um PDF, processando todas as páginas com otimizações de memória.
     */
    async function performOCR(arrayBuffer) {
        updateMessage('... Etapa de OCR: Renderizando PDF para Canvas...', false);
        
        const pdfData = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;

        let fullOCRText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            updateMessage(`... Etapa de OCR: Processando Página ${i} de ${pdf.numPages}...`, false);
            const page = await pdf.getPage(i);

            // Reduzir a escala para 1.5 ajuda a evitar estouro de memória em documentos longos
            const viewport = page.getViewport({ scale: 1.5 }); 
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Mostra o canvas na primeira página, esconde nas demais (para otimização e visual)
            canvasContainer.style.display = (i === 1) ? 'block' : 'none';
            
            const renderContext = {
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            };
            await page.render(renderContext).promise;

            const imageURL = canvas.toDataURL('image/png');

            updateMessage(`... OCR na Página ${i}: Executando Tesseract...`, false);
            
            const { data: { text } } = await Tesseract.recognize(
                imageURL,
                'por',
                { 
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            // Atualiza a mensagem de progresso do OCR
                            updateMessage(`... OCR na Pág ${i}: ${Math.round(m.progress * 100)}% concluído...`, false);
                        }
                    } 
                }
            );

            // 4. Limpeza de Recursos (Estratégia de otimização de memória)
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

            fullOCRText += text.trim() + '\n\n-- Página ' + i + ' (OCR) --\n\n';
        }

        return fullOCRText.trim();
    }
    
    // ------------------- FUNÇÃO DE INTEGRAÇÃO COM IA -------------------

    /**
     * Envia o texto extraído para a API do Google Gemini para processamento.
     * **A CHAVE DE API DEVE SER SUBSTITUÍDA PELO USUÁRIO.**
     */
    async function analyzeTextWithAI(text) {
        aiOutput.textContent = 'Enviando para o Google Gemini...';
        analyzeButton.disabled = true;

        // 🎯 Onde você deve colocar a sua chave de API
        const apiKey = "AIzaSyC_D3EUasnUPSQxjqtT5Slekj5ew9gkVYE"; 
        
        if (apiKey === "AIzaSyC_D3EUasnUPSQxjqtT5Slekj5ew9gkVYE") {
             aiOutput.textContent = 'Erro: A chave de API não foi substituída. Insira sua chave Gemini no script.js.';
             analyzeButton.disabled = false;
             return;
        }

        // Endpoint para o modelo Gemini 2.5 Flash (ótimo para sumarização rápida)
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // Prompt de Instrução (Você pode refinar esta instrução!)
        const promptInstruction = 
            `Você é um assistente especializado em análise de documentos e pranchas. 
            O texto a seguir foi extraído de um PDF, por isso pode conter erros de OCR. 
            Sua tarefa é ler o texto e fornecer uma análise em bullet points (pontos principais) em Português.

            1.  **Assunto Principal:** Identifique o tópico central.
            2.  **Tipo de Documento:** Especifique se é uma fatura, uma prancha de engenharia, um relatório, etc.
            3.  **Principais Dados (Se Houver):** Extraia datas, nomes de empresas, números de projeto, ou valores importantes.
            
            TEXTO EXTRAÍDO: \n\n ${text}`;

        try {
            const response = await fetch(endpoint, {
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
                    config: {
                        temperature: 0.1, 
                        maxOutputTokens: 500
                    }
                })
            });

            if (!response.ok) {
                // Captura erros de rede ou status HTTP (ex: 401, 403, 500)
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `Erro HTTP: ${response.status}. Verifique sua API Key, permissões e limites de uso.`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            // Extrai o texto da resposta do Gemini
            const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (aiResponseText) {
                aiOutput.textContent = aiResponseText;
            } else {
                aiOutput.textContent = "A IA não conseguiu gerar uma resposta. Resposta bruta: " + JSON.stringify(data, null, 2);
            }


        } catch (error) {
            aiOutput.textContent = `Erro na análise de IA: ${error.message}`;
            console.error('Erro de API da IA:', error);
        } finally {
            analyzeButton.disabled = false;
        }
    }
});



