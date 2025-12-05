import { Component, signal, output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuestionChallengeComponent } from '../question-challenge/question-challenge.component';

interface Question {
    question: string;
    answers: string[];
    correct: number;
}

@Component({
    selector: 'app-question-challenge-home',
    standalone: true,
    imports: [CommonModule, QuestionChallengeComponent],
    templateUrl: './question-challenge-home.component.html',
    styleUrls: ['./question-challenge-home.component.css']
})
export class QuestionChallengeHomeComponent {
    @ViewChild(QuestionChallengeComponent) gameComponent?: QuestionChallengeComponent;

    protected gameStarted = signal(false);
    protected questionsLoaded = signal(false);
    protected uploadError = signal<string | null>(null);
    protected fileName = signal<string | null>(null);
    protected questionCount = signal(0);
    protected questionsPerRound = signal(4);
    protected timeLimit = signal(90);

    backToArcade = output<void>();

    private uploadedQuestions: Question[] = [];

    startGame(): void {
        if (this.questionsLoaded()) {
            this.gameStarted.set(true);
            // Set configuration after game component is created
            setTimeout(() => {
                if (this.gameComponent) {
                    this.gameComponent.setQuestionsPerRound(this.questionsPerRound());
                    this.gameComponent.setTimeLimit(this.timeLimit());
                    this.gameComponent.loadQuestionsFromData(this.uploadedQuestions);
                }
            }, 0);
        }
    }

    exitGame(): void {
        this.gameStarted.set(false);
    }

    goBackToArcade(): void {
        this.backToArcade.emit();
    }

    setQuestionsPerRound(count: number): void {
        this.questionsPerRound.set(count);
    }

    getQuestionsPerRound(): number {
        return this.questionsPerRound();
    }

    setTimeLimit(seconds: number): void {
        this.timeLimit.set(seconds);
    }

    getTimeLimit(): number {
        return this.timeLimit();
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];

            // Validate file extension
            if (!file.name.toLowerCase().endsWith('.csv')) {
                this.uploadError.set('Invalid file type. Please upload a .csv file.');
                this.fileName.set(null);
                this.questionsLoaded.set(false);
                input.value = ''; // Clear the input
                return;
            }

            this.fileName.set(file.name);
            this.uploadError.set(null);

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csvText = e.target?.result as string;
                    this.parseAndValidateCSV(csvText);
                } catch (error) {
                    this.uploadError.set('Error reading file. Please try again.');
                    this.questionsLoaded.set(false);
                    input.value = ''; // Clear the input on error
                }
            };
            reader.readAsText(file);
        }
    }

    private parseAndValidateCSV(csvText: string): void {
        // Parse CSV with proper handling of quoted multi-line fields
        const rows = this.parseCSV(csvText);

        if (rows.length < 2) {
            this.uploadError.set('File must contain at least a header and one question.');
            this.questionsLoaded.set(false);
            return;
        }

        const questions: Question[] = [];
        let errorMessages: string[] = [];

        // Skip header row, start from row 1
        for (let i = 1; i < rows.length; i++) {
            const parts = rows[i];
            if (parts.length === 0 || !parts[0]) continue;

            if (parts.length < 5) {
                errorMessages.push(`Line ${i + 1}: Not enough columns (need at least 5: question + 4 answers)`);
                continue;
            }

            const question = parts[0].trim();
            const correctAnswer = parts[1].trim();
            const wrongAnswers = [parts[2].trim(), parts[3].trim(), parts[4].trim()];

            if (!question) {
                errorMessages.push(`Line ${i + 1}: Question is empty`);
                continue;
            }

            if (!correctAnswer) {
                errorMessages.push(`Line ${i + 1}: Correct answer is empty`);
                continue;
            }

            if (wrongAnswers.some(a => !a)) {
                errorMessages.push(`Line ${i + 1}: One or more wrong answers are empty`);
                continue;
            }

            // Randomly shuffle answers
            const allAnswers = [correctAnswer, ...wrongAnswers];
            const shuffledAnswers = this.shuffleArray(allAnswers);
            const correctIndex = shuffledAnswers.indexOf(correctAnswer);

            questions.push({
                question: question,
                answers: shuffledAnswers,
                correct: correctIndex
            });
        }

        if (errorMessages.length > 0 && questions.length === 0) {
            this.uploadError.set(`Errors found:\n${errorMessages.slice(0, 3).join('\n')}`);
            this.questionsLoaded.set(false);
            return;
        }

        const minQuestions = this.questionsPerRound();
        if (questions.length < minQuestions) {
            this.uploadError.set(`Need at least ${minQuestions} valid questions. Found only ${questions.length}.`);
            this.questionsLoaded.set(false);
            return;
        }

        this.uploadedQuestions = questions;
        this.questionCount.set(questions.length);
        this.questionsLoaded.set(true);
        this.uploadError.set(null);
    }

    private parseCSV(csvText: string): string[][] {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    currentField += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                currentRow.push(currentField.trim());
                currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // End of row (handle both \n and \r\n)
                if (char === '\r' && nextChar === '\n') {
                    i++; // Skip \n in \r\n
                }
                currentRow.push(currentField.trim());
                if (currentRow.some(field => field.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
            } else {
                // Regular character (including newlines inside quotes)
                currentField += char;
            }
        }

        // Handle last field and row
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field.length > 0)) {
            rows.push(currentRow);
        }

        return rows;
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    getQuestions(): Question[] {
        return this.uploadedQuestions;
    }

    downloadSampleCSV(): void {
        const sampleCSV = `Question,Correct Answer,Wrong Answer 1,Wrong Answer 2,Wrong Answer 3
What is the capital of France?,Paris,London,Berlin,Madrid
What is 2 + 2?,4,3,5,6
Which planet is known as the Red Planet?,Mars,Venus,Jupiter,Saturn
Who painted the Mona Lisa?,Da Vinci,Picasso,Van Gogh,Monet
What is the largest ocean on Earth?,Pacific,Atlantic,Indian,Arctic
How many continents are there?,7,5,6,8
What is the chemical symbol for gold?,Au,Ag,Fe,Cu
Which year did World War II end?,1945,1943,1944,1946
What is the smallest prime number?,2,0,1,3
Who wrote Romeo and Juliet?,Shakespeare,Dickens,Hemingway,Austen
question,answer1,answer2,answer3,answer4,correct
What is the capital of France?,London,Berlin,Paris,Madrid,3
Which planet is known as the Red Planet?,Venus,Mars,Jupiter,Saturn,2
What is 7 x 8?,54,56,58,64,2
Who painted the Mona Lisa?,Van Gogh,Picasso,Da Vinci,Monet,3
What is the largest ocean on Earth?,Atlantic,Indian,Arctic,Pacific,4
How many continents are there?,5,6,7,8,3
What is the chemical symbol for gold?,Au,Ag,Fe,Cu,1
Which year did World War II end?,1943,1944,1945,1946,3
What is the smallest prime number?,0,1,2,3,3
Who wrote Romeo and Juliet?,Dickens,Shakespeare,Hemingway,Austen,2
What is the speed of light?,299792 km/s,300000 km/s,299792458 m/s,186000 mi/s,1
Which gas do plants absorb?,Oxygen,Nitrogen,Carbon Dioxide,Hydrogen,3
What is the largest mammal?,Elephant,Blue Whale,Giraffe,Polar Bear,2
How many sides does a hexagon have?,5,6,7,8,2
What is the boiling point of water?,90°C,95°C,100°C,105°C,3
Which country has the most population?,USA,India,China,Brazil,3
What is the square root of 144?,10,11,12,13,3
Who discovered penicillin?,Einstein,Fleming,Curie,Pasteur,2
What is the currency of Japan?,Yuan,Won,Yen,Rupee,3
How many bones are in the human body?,196,206,216,226,2
What is the largest planet?,Earth,Jupiter,Saturn,Neptune,2
Which element has atomic number 1?,Helium,Hydrogen,Lithium,Carbon,2
What is the capital of Australia?,Sydney,Melbourne,Canberra,Brisbane,3
How many days in a leap year?,364,365,366,367,3
What is the freezing point of water?,0°C,-1°C,1°C,32°F,1
Which ocean is the smallest?,Arctic,Indian,Atlantic,Southern,1
What is the hardest natural substance?,Gold,Iron,Diamond,Titanium,3
How many strings does a guitar have?,4,5,6,7,3
What is the largest desert?,Gobi,Sahara,Arabian,Kalahari,2
Which vitamin is produced by sunlight?,A,B,C,D,4
What is the fastest land animal?,Lion,Cheetah,Leopard,Jaguar,2
How many planets are in our solar system?,7,8,9,10,2
What is the main ingredient in bread?,Rice,Wheat,Corn,Oats,2
Which country invented pizza?,France,Spain,Italy,Greece,3
What is the longest river in the world?,Amazon,Nile,Yangtze,Mississippi,2
How many colors in a rainbow?,5,6,7,8,3
What is the smallest country?,Monaco,Vatican,Malta,Liechtenstein,2
Which instrument has 88 keys?,Organ,Accordion,Piano,Harpsichord,3
What is the tallest mountain?,K2,Everest,Kilimanjaro,Denali,2
How many seconds in a minute?,30,50,60,90,3`;

        const blob = new Blob([sampleCSV], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', 'sample-questions.csv');
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }
}
