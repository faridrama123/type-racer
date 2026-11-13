export type Language = 'id' | 'en';

export type CarModelId = 'formula' | 'gt' | 'rally' | 'muscle' | 'ev' | 'classic';

export interface CarColor {
  id: string;
  name: string;
  hex: string;
  accent: string;
}

export interface Passage {
  id: string;
  title: string;
  author: string;
  category: string;
  language: Language;
  difficulty: 'Normal' | 'Menengah' | 'Tantangan';
  text: string;
}

export type RoomStatus = 'LOBBY' | 'COUNTDOWN' | 'RACING' | 'FINISHED';

export interface RacerState {
  id: string;
  name: string;
  carModel: CarModelId;
  carColor: string;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  isBot?: boolean;
  progress: number; // 0 to 100
  typedChars: number;
  wpm: number;
  accuracy: number;
  mistakes: number;
  finished: boolean;
  finishRank: number | null;
  finishTimeMs: number | null;
}

export interface RoomState {
  code: string;
  name: string;
  status: RoomStatus;
  isPublic: boolean;
  passage: Passage;
  countdownSeconds: number;
  startTime: number | null;
  players: RacerState[];
}

export interface PublicRoomSummary {
  code: string;
  name: string;
  hostName: string;
  playerCount: number;
  status: RoomStatus;
  language: Language;
}

export interface ShareableScore {
  id: string;
  playerName: string;
  carModel: CarModelId;
  carColor: string;
  wpm: number;
  accuracy: number;
  elapsedMs: number;
  mistakes: number;
  rank: number | null;
  totalRacers: number;
  mode: 'solo' | 'wifi';
  passageId: string;
  passageTitle: string;
  passageAuthor: string;
  createdAt: number;
}

export interface NetworkInfo {
  lanUrls: string[];
  port: number;
  hostname: string;
}

export type ClientWsMessage =
  | {
      type: 'room:create';
      payload: {
        playerName: string;
        carModel: CarModelId;
        carColor: string;
        roomName: string;
        isPublic: boolean;
        passage: Passage;
      };
    }
  | {
      type: 'room:join';
      payload: {
        code: string;
        playerName: string;
        carModel: CarModelId;
        carColor: string;
      };
    }
  | {
      type: 'room:leave';
    }
  | {
      type: 'room:update_passage';
      payload: {
        passage: Passage;
      };
    }
  | {
      type: 'player:ready';
      payload: {
        isReady: boolean;
      };
    }
  | {
      type: 'player:update_car';
      payload: {
        carModel: CarModelId;
        carColor: string;
      };
    }
  | {
      type: 'race:start';
    }
  | {
      type: 'race:progress';
      payload: {
        typedChars: number;
        totalChars: number;
        mistakes: number;
        accuracy: number;
        finished: boolean;
      };
    }
  | {
      type: 'race:rematch';
      payload: {
        passage: Passage;
      };
    };

export type ServerWsMessage =
  | {
      type: 'session:init';
      payload: {
        playerId: string;
      };
    }
  | {
      type: 'room:state';
      payload: {
        room: RoomState;
      };
    }
  | {
      type: 'room:left';
    }
  | {
      type: 'race:countdown';
      payload: {
        seconds: number;
      };
    }
  | {
      type: 'race:started';
      payload: {
        startTime: number;
      };
    }
  | {
      type: 'error';
      payload: {
        message: string;
      };
    };
