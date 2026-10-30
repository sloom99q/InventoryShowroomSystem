/**
 * Same shape as the English messages, every leaf a string. Extra keys are
 * allowed so Arabic can carry its additional plural forms
 * (key_zero, key_two, key_few, key_many) next to key_one / key_other.
 */
export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> } & { [extra: string]: unknown }
