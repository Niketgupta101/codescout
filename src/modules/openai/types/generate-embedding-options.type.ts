import OpenAI from "openai";

export type GenerateEmbeddingOptions = {
  input: string;
  model?: OpenAI.Embeddings.EmbeddingModel;
};
