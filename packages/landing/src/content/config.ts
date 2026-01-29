import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date().optional(),
    author: z.string().default('PR Manager Team'),
    category: z.enum(['features', 'guides', 'tips', 'updates']),
    tags: z.array(z.string()),
    image: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog: blogCollection };
