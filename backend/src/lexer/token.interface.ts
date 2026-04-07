import { TokenType } from './tokens';

export interface Token {
  type: TokenType;
  value: string;
}
