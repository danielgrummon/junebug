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
        let fieldStartedWithQuote = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"') {
                if (currentField === '' && !inQuotes) {
                    // Starting a quoted field
                    inQuotes = true;
                    fieldStartedWithQuote = true;
                } else if (inQuotes && nextChar === '"') {
                    // Escaped quote (two quotes in a row = literal quote)
                    currentField += '"';
                    i++; // Skip next quote
                } else if (inQuotes) {
                    // Ending a quoted field
                    inQuotes = false;
                } else {
                    // Quote in the middle of an unquoted field - treat as regular character
                    currentField += char;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                // Only trim if field didn't start with a quote (preserve formatting in code)
                currentRow.push(fieldStartedWithQuote ? currentField : currentField.trim());
                currentField = '';
                fieldStartedWithQuote = false;
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // End of row (handle both \n and \r\n)
                if (char === '\r' && nextChar === '\n') {
                    i++; // Skip \n in \r\n
                }
                // Only trim if field didn't start with a quote
                currentRow.push(fieldStartedWithQuote ? currentField : currentField.trim());
                if (currentRow.some(field => field.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                fieldStartedWithQuote = false;
            } else {
                // Regular character (including newlines inside quotes, and all special chars like ;:[]{}()~$)
                currentField += char;
            }
        }

        // Handle last field and row
        currentRow.push(fieldStartedWithQuote ? currentField : currentField.trim());
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
        // Embedded sample CSV content as fallback
        const sampleCSV = `Question,Correct Answer,Wrong Answer 1,Wrong Answer 2,Wrong Answer 3
"What does this code print?
public class Test {
    public static void main(String[] args) {
        for (int i = 0; i < 3; i++) {
            System.out.print(i + "" "");
        }
    }
}",0 1 2 ,0 1 2,1 2 3 ,0 1 2 3
"What is the output of this code?
String str = ""Java"";
System.out.println(str.length());",4,3,5,6
"Which of the following is NOT a primitive data type in Java?","String","int","double","boolean"
"What does this code print?
int x = 5;
int y = ++x;
System.out.println(x + "" "" + y);",6 6,5 6,6 5,5 5
"What is the correct syntax to declare a constant in Java?","final int MAX = 100;","const int MAX = 100;","static int MAX = 100;","immutable int MAX = 100;"
"Which of the following correctly implements the try-catch block?","try { } catch (Exception e) { }","try { } except (Exception e) { }","try { } handle (Exception e) { }","try { } error (Exception e) { }"
"What does this code output?
String s1 = new String(""Hello"");
String s2 = new String(""Hello"");
System.out.println(s1 == s2);",false,true,null,""
"Which access modifier restricts access to the same class only?","private","protected","default","public"
"What is the correct way to create a generic list?","List<String> list = new ArrayList<>();","List<String> list = new ArrayList<String>();","List list = new ArrayList();","List<String> list = new List<>();"
"What does this code print?
int[] arr = {1, 2, 3, 4, 5};
System.out.println(arr[arr.length - 1]);",5,4,3,1
"Which of the following correctly declares a method that returns nothing?","void myMethod() { }","null myMethod() { }","empty myMethod() { }","none myMethod() { }"
"What is the output?
String str = ""Java"";
str = str + "" 17"";
System.out.println(str);",Java 17,Java,17,Concatenation Error
"Which keyword is used to prevent method overriding?","final","static","abstract","private"
"What does this code output?
Integer a = 10;
Integer b = 10;
System.out.println(a == b);",true,false,null,Error
"What is the correct way to handle multiple exceptions in Java 17?","catch (IOException | SQLException e) { }","catch (IOException, SQLException e) { }","catch (IOException or SQLException e) { }","catch (IOException and SQLException e) { }"`;

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
