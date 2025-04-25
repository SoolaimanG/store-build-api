import z from "zod";

export const generateStoreSchema = z.object({
  message: z
    .string()
    .min(1, "Message length should be greater than zero")
    .max(255, "Message length should be less than 255"),
  uId: z.string().min(10, "Message length should be greater than 9"),
});
