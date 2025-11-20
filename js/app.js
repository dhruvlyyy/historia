document.addEventListener('DOMContentLoaded', () => {
    const { jsPDF } = window.jspdf;

    let appState = {
        preliminary: {},
        cc: {},
        hpiConversation: [],
        history: {},
        social: {},
        labReports: '',
        editingTarget: null
    };
    let chatHistory = [];

    // --- Data Persistence Functions ---
    const saveProgress = () => {
        const currentScreen = document.querySelector('.screen.active')?.id || 'welcome-screen';
        localStorage.setItem('historia_appState', JSON.stringify(appState));
        localStorage.setItem('historia_chatHistory', JSON.stringify(chatHistory));
        localStorage.setItem('historia_currentScreen', currentScreen);
    };

    const clearProgress = () => {
        localStorage.removeItem('historia_appState');
        localStorage.removeItem('historia_chatHistory');
        localStorage.removeItem('historia_currentScreen');
    };

    const loadProgress = () => {
        const savedAppState = localStorage.getItem('historia_appState');
        const savedChatHistory = localStorage.getItem('historia_chatHistory');
        const savedScreen = localStorage.getItem('historia_currentScreen');

        if (savedAppState) {
            try {
                appState = JSON.parse(savedAppState);
                // Populate all forms with restored data
                document.getElementById('name').value = appState.preliminary.name || '';
                document.getElementById('age').value = appState.preliminary.age || '';
                document.getElementById('sex').value = appState.preliminary.sex || 'Male';
                document.getElementById('cc-symptom').value = appState.cc.symptom || '';
                document.getElementById('cc-duration').value = appState.cc.duration || '';
                document.getElementById('psh-details').value = appState.history.surgeries || '';
                document.getElementById('meds-details').value = appState.history.medications || '';
                document.getElementById('social-tobacco').value = appState.social.tobacco || 'Never';
                document.getElementById('social-alcohol').value = appState.social.alcohol || 'Never';
                document.getElementById('lab-reports').value = appState.labReports || '';

                // Restore Chat History if we are past the CC screen
                if (savedChatHistory) {
                    chatHistory = JSON.parse(savedChatHistory);
                    // Rebuild chat UI logic if needed (skipped for now as we don't re-render full chat log on reload easily without complex logic)
                    // However, if we are in HPI screen, we might want to show previous messages.
                    // For simplicity, we will clear chat UI but keep history for API context.
                }

                if (savedScreen) {
                    switchScreen(savedScreen);
                    // Special handling for screens that need specific setup
                    if (savedScreen === 'review-screen') {
                        populateReviewScreen();
                    } else if (savedScreen === 'summary-screen') {
                        // We can't easily re-generate summary without calling API,
                        // so we might redirect to review screen to re-confirm.
                        switchScreen('review-screen');
                    }
                }
            } catch (e) {
                console.error("Error loading saved state:", e);
                clearProgress();
            }
        }
    };
    // ----------------------------------

    const INTERVIEW_PROMPT = `You are Historia AI, an expert clinical history-taking assistant. Your goal is to conduct a detailed History of Presenting Illness (HPI) with a patient.
    1.  Follow the OLD CARTS mnemonic (Onset, Location, Duration, Character, Associated Symptoms, Radiation, Timing, Severity) to analyze the chief complaint.
    2.  Ask **one clear question at a time**.
    3.  When suitable, provide 3-4 short, tappable options. Format your response as: "Question text [OPTION 1|OPTION 2|OPTION 3]".
    4.  Keep your tone empathetic and professional.
    5.  After you have thoroughly covered all aspects of OLD CARTS, end your turn by responding with only the text: [HPI_COMPLETE]`;

    const SUMMARY_PROMPT_TEMPLATE = (data) => `You are a Differential Diagnosis Expert AI for a clinical setting in India. Analyze the following comprehensive patient data.

    **PATIENT DATA:**
    - **Demographics:** ${data.preliminary.name}, ${data.preliminary.age}, ${data.preliminary.sex}
    - **Chief Complaint:** ${data.cc.symptom} for ${data.cc.duration}
    - **Past History:** Surgeries: ${data.history.surgeries || 'None'}. Medications: ${data.history.medications || 'None'}.
    - **Social History:** Tobacco: ${data.social.tobacco}, Alcohol: ${data.social.alcohol}
    - **Lab Reports:** ${data.labReports || 'Not provided.'}
    - **HPI Conversation Transcript:**
    ${data.hpiConversation.map(item => `AI: ${item.q}\nPatient: ${item.a}`).join('\n')}

    **YOUR TASK:**
    1.  **Synthesize HPI:** Write a concise, narrative "History of Presenting Illness" paragraph in a formal clinical style. Integrate pertinent positives and negatives from the conversation.
    2.  **Analyze Labs:** Explicitly mention any significant findings from the lab reports and correlate them with the clinical picture.
    3.  **Provide Differential Diagnosis:** Based on all available information, list 3-5 "Probable Diagnoses", with the most likely first. For each diagnosis, provide a brief (1-2 sentence) justification based on the patient's data.

    **FORMAT YOUR RESPONSE EXACTLY LIKE THIS:**

    History of Presenting Illness:
    [Your summary paragraph here]

    Probable Diagnoses:
    1. **[Diagnosis 1]:** [Your brief justification here]
    2. **[Diagnosis 2]:** [Your brief justification here]
    3. **[Diagnosis 3]:** [Your brief justification here]
    `;

    const switchScreen = (screenId) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        saveProgress(); // Save on screen switch
    };

    const collectFormData = () => {
        appState.preliminary.name = document.getElementById('name').value;
        appState.preliminary.age = document.getElementById('age').value;
        appState.preliminary.sex = document.getElementById('sex').value;
        appState.cc.symptom = document.getElementById('cc-symptom').value;
        appState.cc.duration = document.getElementById('cc-duration').value;
        appState.history.surgeries = document.getElementById('psh-details').value;
        appState.history.medications = document.getElementById('meds-details').value;
        appState.social.tobacco = document.getElementById('social-tobacco').value;
        appState.social.alcohol = document.getElementById('social-alcohol').value;
        appState.labReports = document.getElementById('lab-reports').value;
        saveProgress(); // Save after collecting data
    };

    const validateScreen = (screenId) => {
        const screen = document.getElementById(screenId);
        const requiredInputs = screen.querySelectorAll('[data-required="true"]');
        let isValid = true;

        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                input.classList.add('invalid');
                isValid = false;
            } else {
                input.classList.remove('invalid');
            }
        });

        return isValid;
    };

    const chatLog = document.getElementById('chat-log');
    const chatInputArea = document.getElementById('chat-input-area');
    const voiceToggle = document.getElementById('voice-mode-toggle');
    let recognition;
    let isListening = false;

    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const inputField = document.querySelector('#chat-input-area input[type="text"]');
            if (inputField) {
                inputField.value = transcript;
                inputField.focus();
            }
        };

        recognition.onend = () => {
            isListening = false;
            updateMicButtonState();
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            isListening = false;
            updateMicButtonState();
        };
    }

    const speakText = (text) => {
        if (voiceToggle.checked && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
        }
    };

    const updateMicButtonState = () => {
        const micBtn = document.querySelector('.mic-btn');
        if (micBtn) {
            if (isListening) {
                micBtn.classList.add('listening');
                micBtn.innerHTML = '⏹️'; // Stop icon
            } else {
                micBtn.classList.remove('listening');
                micBtn.innerHTML = '🎤'; // Mic icon
            }
        }
    };

    const toggleListening = () => {
        if (!recognition) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }
        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
            isListening = true;
        }
        updateMicButtonState();
    };

    const addMessage = (sender, text) => {
        const message = document.createElement('div');
        message.className = `chat-message ${sender}-message`;
        message.innerHTML = `<p>${text.replace(/\n/g, '<br>')}</p>`;
        chatLog.appendChild(message);
        chatLog.scrollTop = chatLog.scrollHeight;
    };

    const showChatLoading = (show) => {
        let indicator = document.getElementById('chat-loading');
        if (show) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'chat-loading';
                indicator.className = 'chat-message ai-message';
                indicator.innerHTML = `<p>...</p>`;
                chatLog.appendChild(indicator);
            }
        } else if (indicator) {
            indicator.remove();
        }
    };

    const processAiResponse = (text) => {
        if (text.trim() === '[HPI_COMPLETE]') {
            addMessage('ai', "Thank you. We've completed the detailed analysis.");
            setTimeout(() => switchScreen('past-medical-history-screen'), 2000);
            return;
        }
        const optionRegex = /\[(.*?)\]/;
        const match = text.match(optionRegex);
        let question = text;
        let options = [];
        if (match) {
            question = text.replace(optionRegex, '').trim();
            options = match[1].split('|').map(opt => opt.trim());
        }
        addMessage('ai', question);
        speakText(question); // Read out the question
        chatHistory.push({ role: "assistant", content: question });
        chatInputArea.innerHTML = '';

        if (options.length > 0) {
            // Multi-select Logic
            let selectedOptions = [];

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.textContent = opt;
                btn.onclick = () => {
                    if (selectedOptions.includes(opt)) {
                        selectedOptions = selectedOptions.filter(o => o !== opt);
                        btn.classList.remove('selected');
                    } else {
                        selectedOptions.push(opt);
                        btn.classList.add('selected');
                    }
                };
                chatInputArea.appendChild(btn);
            });

            // Submit button for options
            const submitBtn = document.createElement('button');
            submitBtn.className = 'btn';
            submitBtn.style.marginTop = '10px';
            submitBtn.style.width = 'auto';
            submitBtn.style.padding = '8px 20px';
            submitBtn.textContent = 'Confirm Selection';
            submitBtn.onclick = () => {
                if (selectedOptions.length > 0) {
                    sendUserResponse(selectedOptions.join(', '));
                }
            };
            chatInputArea.appendChild(submitBtn);

        } else {
            // Text Input + Mic
            const inputWrapper = document.createElement('div');
            inputWrapper.style.cssText = "display: flex; align-items: center; width: 100%; gap: 10px;";

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Type your answer...';
            input.style.cssText = 'flex-grow: 1; padding: 10px; border-radius: 20px;';

            const micBtn = document.createElement('button');
            micBtn.className = 'mic-btn';
            micBtn.innerHTML = '🎤';
            micBtn.onclick = toggleListening;

            const sendBtn = document.createElement('button');
            sendBtn.textContent = 'Send';
            sendBtn.className = 'option-btn';
            sendBtn.style.borderRadius = '50px';
            sendBtn.onclick = () => { if (input.value) sendUserResponse(input.value); };

            input.onkeydown = (e) => { if (e.key === 'Enter') sendBtn.click(); };

            inputWrapper.appendChild(input);
            inputWrapper.appendChild(micBtn);
            inputWrapper.appendChild(sendBtn);
            chatInputArea.appendChild(inputWrapper);

            input.focus();
        }
    };

    const sendUserResponse = (text) => {
        addMessage('user', text);
        chatHistory.push({ role: "user", content: text });
        appState.hpiConversation.push({ q: chatHistory[chatHistory.length - 2]?.content || 'N/A', a: text });
        chatInputArea.innerHTML = '';
        saveProgress(); // Save chat progress
        callGenerativeApi(INTERVIEW_PROMPT, chatHistory, processAiResponse);
    };

    const callGenerativeApi = async (systemPrompt, conversationHistory, callback) => {
        showChatLoading(true);
        const apiUrl = '/api/groq-proxy';
        const payload = {
            messages: [ { role: "system", content: systemPrompt }, ...conversationHistory ],
            tool_choice: "none"
        };
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API error: ${response.status}. Details: ${errorBody}`);
            }
            const result = await response.json();
            const choice = result.choices[0];
            let aiText = null;
            if (choice.message && choice.message.content) {
                aiText = choice.message.content;
            } else if (choice.message && choice.message.tool_calls) {
                const toolArgs = JSON.parse(choice.message.tool_calls[0].function.arguments);
                aiText = toolArgs.question;
                if (toolArgs.options) aiText += ` [${toolArgs.options.join('|')}]`;
            }
            if (aiText === null) throw new Error("Invalid response structure from AI.");
            callback(aiText);
        } catch (error) {
            console.error("Error calling AI model:", error);
            addMessage('ai', "Error connecting to AI. Please check console for details.");
        } finally {
            showChatLoading(false);
        }
    };

    const populateFormForEdit = (screenId) => {
        switch (screenId) {
            case 'preliminary-data-screen':
                document.getElementById('name').value = appState.preliminary.name || '';
                document.getElementById('age').value = appState.preliminary.age || '';
                document.getElementById('sex').value = appState.preliminary.sex || 'Male';
                break;
            case 'chief-complaint-screen':
                document.getElementById('cc-symptom').value = appState.cc.symptom || '';
                document.getElementById('cc-duration').value = appState.cc.duration || '';
                break;
            case 'past-medical-history-screen':
                document.getElementById('psh-details').value = appState.history.surgeries || '';
                document.getElementById('meds-details').value = appState.history.medications || '';
                break;
            case 'social-history-screen':
                document.getElementById('social-tobacco').value = appState.social.tobacco || 'Never';
                document.getElementById('social-alcohol').value = appState.social.alcohol || 'Never';
                break;
            case 'lab-report-screen':
                document.getElementById('lab-reports').value = appState.labReports || '';
                break;
        }
    };

    const populateReviewScreen = () => {
        collectFormData();
        const container = document.getElementById('review-container');
        container.innerHTML = `
            <div class="review-section">
                <div class="review-header"><h3>Preliminary Data</h3><button class="edit-btn" data-screen="preliminary-data-screen">Edit</button></div>
                <div class="review-content">
                    Name: ${appState.preliminary.name || 'N/A'}<br>
                    Age: ${appState.preliminary.age || 'N/A'}<br>
                    Sex: ${appState.preliminary.sex || 'N/A'}
                </div>
            </div>
            <div class="review-section">
                <div class="review-header"><h3>Chief Complaint</h3><button class="edit-btn" data-screen="chief-complaint-screen">Edit</button></div>
                <div class="review-content">${appState.cc.symptom || 'N/A'} for ${appState.cc.duration || 'N/A'}</div>
            </div>
             <div class="review-section">
                <div class="review-header"><h3>Past History</h3><button class="edit-btn" data-screen="past-medical-history-screen">Edit</button></div>
                <div class="review-content">
                    Surgeries: ${appState.history.surgeries || 'None'}<br>
                    Medications: ${appState.history.medications || 'None'}
                </div>
            </div>
            <div class="review-section">
                <div class="review-header"><h3>Social History</h3><button class="edit-btn" data-screen="social-history-screen">Edit</button></div>
                <div class="review-content">
                    Tobacco: ${appState.social.tobacco || 'N/A'}<br>
                    Alcohol: ${appState.social.alcohol || 'N/A'}
                </div>
            </div>
            <div class="review-section">
                <div class="review-header"><h3>Lab Reports</h3><button class="edit-btn" data-screen="lab-report-screen">Edit</button></div>
                <div class="review-content">${appState.labReports || 'None'}</div>
            </div>
        `;
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = (e) => {
                const screenId = e.target.dataset.screen;
                appState.editingTarget = 'review-screen';
                populateFormForEdit(screenId);
                switchScreen(screenId);
            };
        });
    };

    const generateAndDisplaySummary = async () => {
        switchScreen('loading-summary-screen');
        const summaryPrompt = SUMMARY_PROMPT_TEMPLATE(appState);
        await callGenerativeApi(summaryPrompt, [], (summaryText) => {
            const summaryOutput = document.getElementById('summary-output');
            const hpiMatch = summaryText.match(/History of Presenting Illness:\s*([\s\S]*?)\s*Probable Diagnoses:/);
            const dxMatch = summaryText.match(/Probable Diagnoses:\s*([\s\S]*)/);
            const hpiSummary = hpiMatch ? hpiMatch[1].trim() : "Could not generate HPI summary.";
            const diagnoses = dxMatch ? dxMatch[1].trim() : "Could not generate diagnoses.";
            summaryOutput.innerHTML = `
<h3>A. Preliminary Data</h3>
<strong>Name:</strong> <span>${appState.preliminary.name || 'N/A'}</span>
<strong>Age/Sex:</strong> <span>${appState.preliminary.age || 'N/A'} / ${appState.preliminary.sex || 'N/A'}</span>
<h3>B. Chief Complaint</h3>
<span>${appState.cc.symptom || 'N/A'} for ${appState.cc.duration || 'N/A'}</span>
<h3>C. History of Presenting Illness</h3>
<p style="font-family: 'Poppins', sans-serif;">${hpiSummary}</p>
<h3>D. Past & Social History</h3>
<span>Surgeries: ${appState.history.surgeries || 'None'}<br>Medications: ${appState.history.medications || 'None'}<br>Tobacco: ${appState.social.tobacco}<br>Alcohol: ${appState.social.alcohol}</span>
<h3>Lab Findings</h3>
<pre>${appState.labReports || 'None provided.'}</pre>
<h3>AI-Suggested Probable Diagnoses</h3>
<pre>${diagnoses}</pre>
            `;
            switchScreen('summary-screen');
        });
    };

    document.getElementById('begin-history-btn').addEventListener('click', () => {
        switchScreen('preliminary-data-screen');
    });

    document.querySelectorAll('.next-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentScreen = e.target.closest('.screen').id;
            if (!validateScreen(currentScreen)) {
                return;
            }

            collectFormData();
            if (appState.editingTarget) {
                const target = appState.editingTarget;
                appState.editingTarget = null;
                populateReviewScreen();
                switchScreen(target);
            } else {
                switchScreen(btn.dataset.next);
            }
        });
    });

    document.getElementById('start-hpi-btn').addEventListener('click', () => {
        if (!validateScreen('chief-complaint-screen')) {
            return;
        }
        collectFormData();
        switchScreen('hpi-chat-screen');
        const initialPrompt = `Start of consultation. Patient: ${appState.preliminary.name}, ${appState.preliminary.age}. Chief Complaint: ${appState.cc.symptom} for ${appState.cc.duration}.`;
        chatHistory.push({ role: "user", content: initialPrompt });
        callGenerativeApi(INTERVIEW_PROMPT, chatHistory, processAiResponse);
    });

    document.getElementById('review-screen').addEventListener('focusin', populateReviewScreen);
    document.getElementById('confirm-and-generate-btn').addEventListener('click', generateAndDisplaySummary);

    document.getElementById('download-pdf-btn').addEventListener('click', () => {
        const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        let yPos = 20;

        // Helper to add wrapped text
        const printSection = (title, content) => {
             if (yPos > pageHeight - 40) {
                 pdf.addPage();
                 yPos = 20;
             }

             pdf.setFont('helvetica', 'bold');
             pdf.setFontSize(12);
             pdf.setTextColor(59, 130, 246); // Blue
             pdf.text(title, margin, yPos);
             yPos += 7;

             pdf.setFont('helvetica', 'normal');
             pdf.setFontSize(10);
             pdf.setTextColor(0, 0, 0);

             const lines = pdf.splitTextToSize(content, pageWidth - (margin * 2));
             pdf.text(lines, margin, yPos);
             yPos += (lines.length * 5) + 10;
        };

        // Header Background
        pdf.setFillColor(17, 24, 39); // Dark BG
        pdf.rect(0, 0, pageWidth, 40, 'F');

        // Header Text
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(22);
        pdf.text("Historia AI", margin, 25);

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text("Clinical Summary Report", pageWidth - margin, 25, { align: 'right' });

        yPos = 55;
        pdf.setTextColor(0, 0, 0);

        // Patient Info
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(`Patient: ${appState.preliminary.name || 'N/A'}`, margin, yPos);
        yPos += 6;
        pdf.text(`Age/Sex: ${appState.preliminary.age || 'N/A'} / ${appState.preliminary.sex || 'N/A'}`, margin, yPos);
        yPos += 6;
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos);
        yPos += 15;

        // Line Separator
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, yPos - 5, pageWidth - margin, yPos - 5);

        // Extract Content from DOM or State
        const summaryContainer = document.getElementById('summary-output');
        const hpiText = summaryContainer.querySelector('h3:nth-of-type(3) + p')?.innerText || "N/A";

        // Reconstruct Past History text for better formatting than DOM
        const pastHistoryText = `Surgeries: ${appState.history.surgeries || 'None'}\nMedications: ${appState.history.medications || 'None'}\nTobacco: ${appState.social.tobacco}\nAlcohol: ${appState.social.alcohol}`;

        const labText = appState.labReports || "None provided.";
        const dxText = summaryContainer.querySelector('h3:nth-of-type(6) + pre')?.innerText || "N/A";

        // Print Sections
        printSection("1. Chief Complaint", `${appState.cc.symptom} (${appState.cc.duration})`);
        printSection("2. History of Presenting Illness", hpiText);
        printSection("3. Past & Social History", pastHistoryText);
        printSection("4. Lab Findings", labText);
        printSection("5. Assessment & Plan (AI Suggestions)", dxText);

        // Footer on all pages
        const pageCount = pdf.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            pdf.text(`Generated by Historia AI - Page ${i} of ${pageCount} - Disclaimer: AI-generated content. Verify with a professional.`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }

        pdf.save(`Historia_AI_Summary_${appState.preliminary.name.replace(/\s+/g, '_')}.pdf`);
    });

    // Start New Logic
    document.getElementById('start-new-btn')?.addEventListener('click', () => {
        clearProgress();
        window.location.reload();
    });

    // Load saved progress on init
    loadProgress();

    // Disclaimer Logic
    const disclaimerModal = document.getElementById('disclaimer-modal');
    const acceptDisclaimerBtn = document.getElementById('accept-disclaimer-btn');

    // Check if previously accepted (optional storage)
    // For now, we force it every time as it is critical.

    acceptDisclaimerBtn.addEventListener('click', () => {
        disclaimerModal.style.transition = "opacity 0.5s ease";
        disclaimerModal.style.opacity = "0";
        setTimeout(() => {
            disclaimerModal.style.display = "none";
        }, 500);
    });

    const reportUploadInput = document.getElementById('report-upload');
    const ocrStatus = document.getElementById('ocr-status');
    const labReportsTextarea = document.getElementById('lab-reports');

    reportUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        ocrStatus.textContent = 'Reading report... this may take a moment.';

        Tesseract.recognize(
            file,
            'eng',
            {
                logger: m => console.log(m)
            }
        ).then(({ data: { text } }) => {
            labReportsTextarea.value = text;
            ocrStatus.textContent = 'Text extracted successfully!';
        }).catch(err => {
            console.error(err);
            ocrStatus.textContent = 'Error reading image. Please try again.';
        });
    });

    // --- Mobile Optimization Helpers ---

    // Ensure chat scrolls to bottom on window resize (e.g., keyboard open)
    window.addEventListener('resize', () => {
        if (document.getElementById('hpi-chat-screen').classList.contains('active')) {
             const chatLog = document.getElementById('chat-log');
             // Small delay to ensure layout update is finished
             setTimeout(() => {
                chatLog.scrollTop = chatLog.scrollHeight;
             }, 100);
        }
    });

    // Ensure active inputs are visible on mobile when keyboard opens
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            // On mobile, wait for keyboard to likely appear then scroll
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 300);
            }
        });
    });

});
