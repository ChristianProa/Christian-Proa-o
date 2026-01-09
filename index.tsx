import { GoogleGenAI } from "@google/genai";

// --- TYPE DEFINITIONS ---
interface QuestionOption {
    label: string;
    text_es: string;
    text_nl: string;
}

interface Question {
    id: string;
    section: string;
    subsection: string;
    question_es: string;
    question_nl: string;
    options: QuestionOption[];
    correct_option: string;
    explanation_es: string;
    explanation_nl: string;
    commands?: string[];
}

type QuizMode = 'practice' | 'exam';
type AppState = 'welcome' | 'quiz' | 'results' | 'review';

// --- DOM ELEMENT SELECTORS ---
const practiceSectionsEl = document.getElementById('practice-sections') as HTMLUListElement;
const examSectionsEl = document.getElementById('exam-sections') as HTMLUListElement;
const welcomeScreenEl = document.getElementById('welcome-screen') as HTMLDivElement;
const quizContainerEl = document.getElementById('quiz-container') as HTMLDivElement;
const resultsScreenEl = document.getElementById('results-screen') as HTMLDivElement;
const quizTitleEl = document.getElementById('quiz-title') as HTMLHeadingElement;
const progressBarEl = document.getElementById('progress-bar') as HTMLDivElement;
const questionTextEl = document.getElementById('question-text') as HTMLParagraphElement;
const optionsGridEl = document.getElementById('options-grid') as HTMLDivElement;
const explanationEl = document.getElementById('explanation') as HTMLDivElement;
const explanationTextEl = document.getElementById('explanation-text') as HTMLParagraphElement;
const questionCounterEl = document.getElementById('question-counter') as HTMLSpanElement;
const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
const finishBtn = document.getElementById('finish-btn') as HTMLButtonElement;
const resultsScoreEl = document.getElementById('results-score') as HTMLDivElement;
const resultsSummaryEl = document.getElementById('results-summary') as HTMLParagraphElement;
const reviewBtn = document.getElementById('review-btn') as HTMLButtonElement;
const retryFailuresBtn = document.getElementById('retry-failures-btn') as HTMLButtonElement;
const mainMenuBtn = document.getElementById('main-menu-btn') as HTMLButtonElement;


// --- APPLICATION STATE ---
let allQuestions: Question[] = [];
let sections: Map<string, string[]> = new Map();
let currentQuestions: Question[] = [];
let userAnswers: { [key: string]: string } = {};
let currentQuestionIndex = 0;
let currentMode: QuizMode = 'practice';
let currentSection: string | null = null;
let appState: AppState = 'welcome';

// --- CORE LOGIC ---

async function init() {
    try {
        const response = await fetch('./questions.json');
        if (!response.ok) throw new Error('Network response was not ok');
        allQuestions = await response.json();
        
        // Process sections and subsections
        allQuestions.forEach(q => {
            if (!sections.has(q.section)) {
                sections.set(q.section, []);
            }
            const subsections = sections.get(q.section)!;
            if (!subsections.includes(q.subsection)) {
                subsections.push(q.subsection);
            }
        });

        populateSidebar();
        addEventListeners();
        loadState();
        updateUI();
    } catch (error) {
        console.error('Failed to load questions:', error);
        welcomeScreenEl.innerHTML = '<h2>Error al cargar las preguntas.</h2><p>Por favor, recarga la página.</p>';
    }
}

function populateSidebar() {
    const sectionNames = Array.from(sections.keys());
    
    const createButton = (section: string, mode: QuizMode) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.textContent = section;
        button.onclick = () => startQuiz(mode, section);
        li.appendChild(button);
        return li;
    };

    sectionNames.forEach(section => {
        practiceSectionsEl.appendChild(createButton(section, 'practice'));
    });
    
    const examAllLi = document.createElement('li');
    const examAllBtn = document.createElement('button');
    examAllBtn.textContent = 'Examen Completo';
    examAllBtn.onclick = () => startQuiz('exam', null);
    examAllLi.appendChild(examAllBtn);
    examSectionsEl.appendChild(examAllLi);
    
    sectionNames.forEach(section => {
        const li = createButton(section, 'exam');
        li.firstElementChild!.textContent += ' (Examen)';
        examSectionsEl.appendChild(li);
    });
}

function startQuiz(mode: QuizMode, section: string | null) {
    currentMode = mode;
    currentSection = section;
    currentQuestionIndex = 0;
    userAnswers = {};

    if (section) {
        currentQuestions = allQuestions.filter(q => q.section === section);
    } else {
        // Full exam mode
        currentQuestions = [...allQuestions];
    }
    // Shuffle questions for exam mode
    if (mode === 'exam') {
        currentQuestions.sort(() => Math.random() - 0.5);
    }

    setAppState('quiz');
}

function renderQuestion() {
    if (currentQuestions.length === 0) return;

    explanationEl.classList.remove('visible');
    quizContainerEl.classList.remove('review-mode');

    const question = currentQuestions[currentQuestionIndex];
    quizTitleEl.innerHTML = `${currentSection || 'Examen Completo'} <span class="lang-nl">/ ${currentMode === 'practice' ? 'Oefenen' : 'Examen'}</span>`;
    
    questionTextEl.innerHTML = `<span class="lang-es">${question.question_es}</span><br><span class="lang-nl">${question.question_nl}</span>`;

    optionsGridEl.innerHTML = '';
    question.options.forEach(opt => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.dataset.option = opt.label;
        button.innerHTML = `<span class="option-label">${opt.label}</span> <div><span class="lang-es">${opt.text_es}</span><br><span class="lang-nl">${opt.text_nl}</span></div>`;
        button.onclick = () => handleOptionClick(question.id, opt.label);
        
        if (userAnswers[question.id] === opt.label) {
            button.classList.add('selected');
        }

        optionsGridEl.appendChild(button);
    });
    
    if (appState === 'review') {
        showReviewHighlights();
        showExplanation();
    }

    updateNavigation();
    updateProgress();
    saveState();
}

function handleOptionClick(questionId: string, optionLabel: string) {
    if (appState === 'review') return;
    
    userAnswers[questionId] = optionLabel;
    
    // Visually update selected option
    document.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`.option-button[data-option="${optionLabel}"]`)?.classList.add('selected');
    
    if (currentMode === 'practice') {
        showExplanation();
        showReviewHighlights();
    }
    
    saveState();
}

function showExplanation() {
    const question = currentQuestions[currentQuestionIndex];
    let explanationHTML = `<p><span class="lang-es">${question.explanation_es}</span><br><span class="lang-nl">${question.explanation_nl}</span></p>`;
    
    if (question.commands && question.commands.length > 0) {
        explanationHTML += `<pre><code>${question.commands.join('\n')}</code></pre>`;
    }
    
    explanationTextEl.innerHTML = explanationHTML;
    explanationEl.classList.add('visible');
}

function showReviewHighlights() {
    const question = currentQuestions[currentQuestionIndex];
    const userAnswer = userAnswers[question.id];
    
    quizContainerEl.classList.add('review-mode');
    
    document.querySelectorAll<HTMLButtonElement>('.option-button').forEach(button => {
        const option = button.dataset.option!;
        if (option === question.correct_option) {
            button.classList.add('correct');
        }
        if (userAnswer === option && option !== question.correct_option) {
            button.classList.add('incorrect');
        }
    });
}

function updateNavigation() {
    prevBtn.disabled = currentQuestionIndex === 0;
    
    const isLastQuestion = currentQuestionIndex === currentQuestions.length - 1;
    nextBtn.style.display = isLastQuestion ? 'none' : 'inline-block';
    finishBtn.style.display = isLastQuestion ? 'inline-block' : 'none';

    if (currentMode === 'practice') {
        finishBtn.style.display = 'none';
        nextBtn.style.display = 'inline-block';
        nextBtn.disabled = isLastQuestion;
    }
}

function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;
    progressBarEl.style.width = `${progress}%`;
    questionCounterEl.textContent = `Pregunta ${currentQuestionIndex + 1} de ${currentQuestions.length}`;
}

function showResults() {
    const correctAnswers = currentQuestions.filter(q => userAnswers[q.id] === q.correct_option).length;
    const totalQuestions = currentQuestions.length;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
    resultsScoreEl.textContent = `${score}%`;
    resultsScoreEl.style.color = score >= 60 ? 'var(--correct-color)' : 'var(--incorrect-color)';
    resultsSummaryEl.textContent = `Respondiste correctamente ${correctAnswers} de ${totalQuestions} preguntas.`;
    
    const hasFailures = correctAnswers < totalQuestions;
    retryFailuresBtn.style.display = hasFailures ? 'inline-block' : 'none';

    setAppState('results');
}

function setAppState(newState: AppState) {
    appState = newState;
    updateUI();
}

function updateUI() {
    welcomeScreenEl.style.display = appState === 'welcome' ? 'flex' : 'none';
    quizContainerEl.style.display = (appState === 'quiz' || appState === 'review') ? 'flex' : 'none';
    resultsScreenEl.style.display = appState === 'results' ? 'flex' : 'none';

    if (appState === 'quiz' || appState === 'review') {
        renderQuestion();
    }
}

function saveState() {
    const state = {
        appState,
        currentMode,
        currentSection,
        currentQuestionIndex,
        currentQuestions,
        userAnswers
    };
    localStorage.setItem('serverbeheerQuizState', JSON.stringify(state));
}

function loadState() {
    const savedState = localStorage.getItem('serverbeheerQuizState');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if(state.appState !== 'welcome') {
                appState = state.appState;
                currentMode = state.currentMode;
                currentSection = state.currentSection;
                currentQuestionIndex = state.currentQuestionIndex;
                currentQuestions = state.currentQuestions;
                userAnswers = state.userAnswers;
            }
        } catch (e) {
            console.error("Error loading state from localStorage", e);
            localStorage.removeItem('serverbeheerQuizState');
        }
    }
}

// --- EVENT LISTENERS ---
function addEventListeners() {
    nextBtn.addEventListener('click', () => {
        if (currentQuestionIndex < currentQuestions.length - 1) {
            currentQuestionIndex++;
            renderQuestion();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion();
        }
    });
    
    finishBtn.addEventListener('click', () => {
        const unanswered = currentQuestions.filter(q => !userAnswers[q.id]).length;
        if (unanswered > 0) {
            if (!confirm(`Tienes ${unanswered} preguntas sin responder. ¿Quieres finalizar igualmente?`)) {
                return;
            }
        }
        showResults();
    });
    
    reviewBtn.addEventListener('click', () => {
        currentQuestionIndex = 0;
        setAppState('review');
    });

    retryFailuresBtn.addEventListener('click', () => {
        const failedQuestions = currentQuestions.filter(q => userAnswers[q.id] !== q.correct_option);
        currentQuestions = failedQuestions;
        currentQuestionIndex = 0;
        userAnswers = {};
        setAppState('quiz');
    });
    
    mainMenuBtn.addEventListener('click', () => {
        localStorage.removeItem('serverbeheerQuizState');
        currentQuestions = [];
        userAnswers = {};
        currentQuestionIndex = 0;
        setAppState('welcome');
    });
}


// --- START APPLICATION ---
document.addEventListener('DOMContentLoaded', init);
