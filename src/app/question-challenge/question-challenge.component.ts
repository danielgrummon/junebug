import { Component, OnInit, OnDestroy, HostListener, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

export interface Question {
    question: string;
    answers: string[];
    correct: number;
}

interface QuestionState {
    question: Question;
    selected: number | null;
}

@Component({
    selector: 'app-question-challenge',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './question-challenge.component.html',
    styleUrls: ['./question-challenge.component.css']
})
export class QuestionChallengeComponent implements OnInit, OnDestroy {
    // Input for questions from parent
    questions = input<Question[]>([]);

    // Output for back to home
    backToHome = output<void>();

    protected questionSets: QuestionState[] = [];
    protected timeRemaining = signal(90);
    protected roundComplete = signal(false);
    protected timeExpired = signal(false);
    protected showCongratulations = signal(false);
    protected currentRound = signal(1);
    protected currentRoundCorrect = signal(0);
    protected currentRoundTotal = signal(0);
    protected cumulativeCorrect = signal(0);
    protected cumulativeTotal = signal(0);
    protected roundTheme = signal(0);
    protected showBackButton = signal(true);

    private allQuestions: Question[] = [];
    private timerInterval: any = null;
    private audioContext: AudioContext | null = null;
    private questionsPerRound = 4;
    private timeLimitSeconds = 90;

    // Background theme gradients
    protected readonly themes = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    ];

    constructor(private http: HttpClient) { }

    ngOnInit(): void {
        this.initAudio();

        // Use input questions if provided, otherwise load from CSV
        const inputQuestions = this.questions();
        if (inputQuestions && inputQuestions.length > 0) {
            this.allQuestions = inputQuestions;
            this.startNewRound();
        } else {
            this.loadQuestions();
        }
    }

    // Public method to load questions from parent component
    loadQuestionsFromData(questions: Question[]): void {
        this.allQuestions = questions;
        if (this.allQuestions.length > 0) {
            this.startNewRound();
        }
    }

    // Public method to set questions per round
    setQuestionsPerRound(count: number): void {
        this.questionsPerRound = count;
    }

    // Public method to set time limit
    setTimeLimit(seconds: number): void {
        this.timeLimitSeconds = seconds;
    }

    protected goBack(): void {
        this.stopTimer();
        // Reset all statistics when leaving
        this.cumulativeCorrect.set(0);
        this.cumulativeTotal.set(0);
        this.currentRoundCorrect.set(0);
        this.currentRoundTotal.set(0);
        this.currentRound.set(1);
        this.backToHome.emit();
    }

    ngOnDestroy(): void {
        this.stopTimer();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyDown(event: KeyboardEvent): void {
        if (this.showCongratulations() && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            this.nextRound();
        }
    }

    private initAudio(): void {
        try {
            this.audioContext = new AudioContext();
        } catch (e) {
            console.warn('Audio not supported');
        }
    }

    private playSound(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gainNode.gain.value = 0.15;

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    private playHappySound(): void {
        // Happy ascending notes
        this.playSound(523, 0.15, 'sine'); // C
        setTimeout(() => this.playSound(659, 0.15, 'sine'), 100); // E
        setTimeout(() => this.playSound(784, 0.15, 'sine'), 200); // G
        setTimeout(() => this.playSound(1047, 0.3, 'sine'), 300); // High C
    }

    private playUnhappySound(): void {
        // Unhappy descending notes
        this.playSound(440, 0.2, 'square'); // A
        setTimeout(() => this.playSound(370, 0.2, 'square'), 150); // F#
        setTimeout(() => this.playSound(330, 0.4, 'square'), 300); // E
    }

    private playSelectSound(): void {
        this.playSound(400, 0.05, 'square');
    }

    private async loadQuestions(): Promise<void> {
        try {
            const response = await fetch('assets/questions.csv');
            const csvText = await response.text();
            this.parseCSV(csvText);
            this.startNewRound();
        } catch (error) {
            console.error('Error loading questions:', error);
        }
    }

    private parseCSV(csvText: string): void {
        const lines = csvText.split('\n').filter(line => line.trim());
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',');
            if (parts.length >= 6) {
                this.allQuestions.push({
                    question: parts[0],
                    answers: [parts[1], parts[2], parts[3], parts[4]],
                    correct: parseInt(parts[5]) - 1 // Convert to 0-based index
                });
            }
        }
    }

    private startNewRound(): void {
        // Select random questions based on configured count
        const selected = this.selectRandomQuestions(this.questionsPerRound);
        this.questionSets = selected.map(q => ({
            question: q,
            selected: null
        }));

        // Change theme for variety
        this.roundTheme.set(Math.floor(Math.random() * this.themes.length));

        this.timeRemaining.set(this.timeLimitSeconds);
        this.roundComplete.set(false);
        this.timeExpired.set(false);
        this.showCongratulations.set(false);
        this.currentRoundCorrect.set(0);
        this.currentRoundTotal.set(0);
        this.startTimer();
    }

    private selectRandomQuestions(count: number): Question[] {
        const shuffled = [...this.allQuestions].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    private startTimer(): void {
        this.stopTimer();
        this.timerInterval = setInterval(() => {
            const current = this.timeRemaining();
            if (current > 0) {
                this.timeRemaining.set(current - 1);
            } else {
                this.stopTimer();
                this.timeExpired.set(true);
                this.roundComplete.set(true);
                this.playUnhappySound();
            }
        }, 1000);
    }

    private stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    protected selectAnswer(questionIndex: number, answerIndex: number): void {
        if (this.roundComplete()) return;

        this.questionSets[questionIndex].selected = answerIndex;
        this.playSelectSound();
    }

    protected submitAnswers(): void {
        if (this.roundComplete()) return;

        // Check if all questions are answered
        const allAnswered = this.questionSets.every(qs => qs.selected !== null);
        if (!allAnswered) {
            return;
        }

        this.stopTimer();
        this.roundComplete.set(true);

        // Calculate correct answers
        let correctCount = 0;
        this.questionSets.forEach(qs => {
            if (qs.selected === qs.question.correct) {
                correctCount++;
            }
        });

        // Update statistics
        this.currentRoundCorrect.set(correctCount);
        this.currentRoundTotal.set(this.questionSets.length);
        this.cumulativeCorrect.update(c => c + correctCount);
        this.cumulativeTotal.update(t => t + this.questionSets.length);

        if (!this.timeExpired()) {
            this.playHappySound();
            this.showCongratulations.set(true);
        }
    }

    protected nextRound(): void {
        this.currentRound.update(r => r + 1);
        this.startNewRound();
    }

    protected getFormattedTime(): string {
        const time = this.timeRemaining();
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    protected isCorrectAnswer(questionIndex: number, answerIndex: number): boolean {
        if (!this.roundComplete()) return false;
        return this.questionSets[questionIndex].question.correct === answerIndex;
    }

    protected isWrongAnswer(questionIndex: number, answerIndex: number): boolean {
        if (!this.roundComplete()) return false;
        const qs = this.questionSets[questionIndex];
        return qs.selected === answerIndex && qs.selected !== qs.question.correct;
    }

    protected isSelected(questionIndex: number, answerIndex: number): boolean {
        return this.questionSets[questionIndex].selected === answerIndex;
    }

    protected canSubmit(): boolean {
        return !this.roundComplete() &&
            this.questionSets.every(qs => qs.selected !== null);
    }

    protected getCurrentTheme(): string {
        return this.themes[this.roundTheme()];
    }

    protected getCurrentRoundPercent(): number {
        const total = this.currentRoundTotal();
        if (total === 0) return 0;
        return Math.round((this.currentRoundCorrect() / total) * 100);
    }

    protected getCumulativePercent(): number {
        const total = this.cumulativeTotal();
        if (total === 0) return 0;
        return Math.round((this.cumulativeCorrect() / total) * 100);
    }

    protected hasMultipleRounds(): boolean {
        return this.allQuestions.length > 4;
    }

    protected isPerfectScore(): boolean {
        const total = this.currentRoundTotal();
        if (total === 0) return false;
        return this.currentRoundCorrect() === total;
    }
}
