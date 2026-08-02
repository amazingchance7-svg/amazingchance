import { Permissions } from './permissions.constants';

export type Permission =
  (typeof Permissions)[keyof typeof Permissions];
