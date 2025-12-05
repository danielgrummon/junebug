import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuestionChallengeHomeComponent } from '../question-challenge-home/question-challenge-home.component';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [CommonModule, QuestionChallengeHomeComponent],
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.css']
})
export class HomeComponent {
    protected selectedGame = signal<string | null>(null);

    selectGame(game: string): void {
        this.selectedGame.set(game);
    }

    backToMenu(): void {
        this.selectedGame.set(null);
    }
}
