import { EMAIL_DOMAIN, DEFAULT_GUICHE } from './constants';

/**
 * Formatação pura de dados de usuário — compartilhada entre a UI (avatar) e
 * o servidor (login e criação de usuário).
 */

/** Iniciais do nome (máx. 2 caracteres), usadas no avatar. */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** E-mail padrão derivado do username. */
export function generateEmail(username: string): string {
  return `${username}${EMAIL_DOMAIN}`;
}

/** Guichê padrão quando o cadastro não informa um. */
export function getDefaultGuiche(): string {
  return DEFAULT_GUICHE;
}
