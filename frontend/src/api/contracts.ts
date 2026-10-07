export interface SetupStatus { required: boolean }
export interface User { id: number; name: string; login: string; admin: boolean }
export interface Session { user: User; csrf: string }
export interface Credentials {
  login: string;
  password: string;
  name?: string;
  setupToken?: string;
  demo: boolean;
}
