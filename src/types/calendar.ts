export interface CalendarEvent {
  title: string;
  start_date: string;
  end_date: string;
  location?: string;
  notes?: string;
  is_all_day: boolean;
}
