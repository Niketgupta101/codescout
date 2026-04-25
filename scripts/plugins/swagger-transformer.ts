import { before } from "@nestjs/swagger/dist/plugin";
import { Program, SourceFile, TransformerFactory } from "typescript";

/** Custom transformer for generating swagger types for dtos and controllers
 *
 * `@nestjs/swagger` plugin generates types for dtos and controllers, but
 * only works with nest-cli compiler. To get this to work with ts-node, we must
 * create a custom transformer that can be used with [ts-patch](https://www.npmjs.com/package/ts-patch)
 * and pass it to ts-node as a transformer plugin
 * [ts-node with transformers](https://www.npmjs.com/package/ts-node#third-party-compilers)
 */
export default function transformer(program: Program): TransformerFactory<SourceFile> {
  return before({}, program);
}
