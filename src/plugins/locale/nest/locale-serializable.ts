// LocaleSerializerInterceptor will traverse and serialize all the
// locale strings in any object that is an instance of this class.
// You can extend this class or use it to construct locale serializable
// literals like: LocaleSerializable.from({ message: new LocaleString(...) })

export class LocaleSerializable {
  protected constructor() {}

  static from<T extends Record<string, unknown> = Record<string, unknown>>(value?: T): LocaleSerializable & T {
    return Object.assign(new LocaleSerializable(), value);
  }
}
