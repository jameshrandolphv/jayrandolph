export interface PhotoGroup {
  id: number;
  name: string;
  photos: Photo[] | null;
}

export interface Photo {
  id: number;
  src: string;
  width: number;
  height: number;
  metadata: PhotoMetadata;
}

export type PhotoMetadata = FilmPhotoMetadata | DigitalPhotoMetadata;

export interface FilmPhotoMetadata {
  title: string;
  type: 'film_color_negative' | 'film_color_positive' | 'film_bw';
  roll_number: number;
  developer: string;
  fixer: string;
  dev_number: number;
  film_stock: string;
  iso: number;
  expiration: string;
  size: number;
  number_of_exposures: number;
  dates_shot: string;
  date_developed: string;
  camera: string;
  lens: string;
  dev_time_mins: number;
  dev_temp_f: number;
  fixer_time_mins: number;
  dev_adjustments: string;
  scanner: string;
  notes: string;
}

export interface DigitalPhotoMetadata {}
