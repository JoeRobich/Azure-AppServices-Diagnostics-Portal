import { Injectable } from '@angular/core';

@Injectable()
export class Globals {
  messages: any[] = [];
  openGeniePanel: boolean = false;
  messagesData: { [id: string]: any } = {};
}