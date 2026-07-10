import { Component, input } from '@angular/core';
import { Photo } from '../../../models/Photography';

@Component({
  selector: 'app-photo-card',
  imports: [],
  templateUrl: './photo-card.html',
  styleUrl: './photo-card.scss'
})
export class PhotoCard {
  photo = input.required<Photo>();
}
