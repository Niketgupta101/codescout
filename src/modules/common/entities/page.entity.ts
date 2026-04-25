import { Expose, Type } from "class-transformer";

export class PageCursorEntity {
  @Expose()
  prev?: string;

  @Expose()
  next?: string;
}

export abstract class PageEntity<T> {
  @Expose()
  abstract items: T[];

  @Expose()
  total?: number;

  @Expose()
  @Type(() => PageCursorEntity)
  cursor?: PageCursorEntity;
}
