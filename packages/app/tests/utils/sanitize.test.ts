import { describe, it, expect, vi } from 'vitest';
import { sanitizeHtml, sanitizeText, wasSanitized } from '../../src/utils/sanitize';

describe('Sanitization Utilities', () => {
  describe('sanitizeHtml()', () => {
    describe('XSS Prevention', () => {
      it('should remove script tags', () => {
        const input = '<p>Hello</p><script>alert("xss")</script>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('script');
        expect(result).not.toContain('alert');
      });

      it('should remove event handlers (onclick)', () => {
        const input = '<p onclick="alert(\'xss\')">Click me</p>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onclick');
        expect(result).not.toContain('alert');
      });

      it('should remove event handlers (onerror)', () => {
        const input = '<img src="x" onerror="alert(\'xss\')">';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onerror');
        expect(result).not.toContain('alert');
      });

      it('should remove event handlers (onload)', () => {
        const input = '<body onload="alert(\'xss\')">';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onload');
        expect(result).not.toContain('alert');
      });

      it('should remove javascript: protocol in links', () => {
        const input = '<a href="javascript:alert(\'xss\')">Click</a>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('javascript:');
        expect(result).not.toContain('alert');
      });

      it('should remove data: protocol in images', () => {
        const input = '<img src="data:text/html,<script>alert(\'xss\')</script>">';
        const result = sanitizeHtml(input);
        // Should sanitize dangerous data URIs
        expect(result).not.toContain('script');
      });

      it('should remove style tags with javascript', () => {
        const input = '<style>body{background:url("javascript:alert(\'xss\')")}</style>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('style');
        expect(result).not.toContain('javascript');
      });

      it('should remove nested malicious tags', () => {
        const input = '<div><script>alert("xss")</script></div>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('script');
        expect(result).toContain('div');
      });

      it('should handle case-insensitive tag removal', () => {
        const input = '<SCRIPT>alert("xss")</SCRIPT>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('alert');
      });

      it('should remove iframe tags', () => {
        const input = '<iframe src="http://malicious.com"></iframe>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('iframe');
      });

      it('should remove form tags', () => {
        const input = '<form action="http://evil.com"><input type="text"></form>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('form');
        expect(result).not.toContain('evil.com');
      });

      it('should remove meta tags', () => {
        const input = '<meta http-equiv="refresh" content="0;url=http://evil.com">';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('meta');
        expect(result).not.toContain('evil.com');
      });
    });

    describe('Safe HTML Preservation', () => {
      it('should preserve safe tags', () => {
        const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
        const result = sanitizeHtml(input);
        expect(result).toContain('<p>');
        expect(result).toContain('<strong>');
        expect(result).toContain('<em>');
      });

      it('should preserve safe links with http/https', () => {
        const input = '<a href="https://example.com">Link</a>';
        const result = sanitizeHtml(input);
        expect(result).toContain('href');
        expect(result).toContain('https://example.com');
      });

      it('should preserve safe image tags with src', () => {
        const input = '<img src="https://example.com/image.jpg" alt="Image">';
        const result = sanitizeHtml(input);
        expect(result).toContain('img');
        expect(result).toContain('src');
      });

      it('should preserve lists', () => {
        const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
        const result = sanitizeHtml(input);
        expect(result).toContain('<ul>');
        expect(result).toContain('<li>');
      });

      it('should preserve headings', () => {
        const input = '<h1>Title</h1><h2>Subtitle</h2>';
        const result = sanitizeHtml(input);
        expect(result).toContain('<h1>');
        expect(result).toContain('<h2>');
      });

      it('should preserve code blocks', () => {
        const input = '<pre><code>const x = 1;</code></pre>';
        const result = sanitizeHtml(input);
        expect(result).toContain('<pre>');
        expect(result).toContain('<code>');
      });

      it('should preserve blockquotes', () => {
        const input = '<blockquote>Famous quote</blockquote>';
        const result = sanitizeHtml(input);
        expect(result).toContain('<blockquote>');
      });

      it('should preserve line breaks', () => {
        const input = 'Line 1<br>Line 2';
        const result = sanitizeHtml(input);
        expect(result).toContain('<br>');
      });
    });

    describe('Attribute Handling', () => {
      it('should remove unsafe attributes', () => {
        const input = '<p data-evil="bad" onclick="alert()">Text</p>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onclick');
        expect(result).not.toContain('data-evil');
      });

      it('should preserve allowed attributes', () => {
        const input = '<a href="https://example.com" title="Example">Link</a>';
        const result = sanitizeHtml(input);
        expect(result).toContain('href');
        expect(result).toContain('title');
      });
    });
  });

  describe('sanitizeText()', () => {
    it('should remove all HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      const result = sanitizeText(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).toBe('Hello world');
    });

    it('should remove script tags completely', () => {
      const input = 'Text <script>alert("xss")</script> more text';
      const result = sanitizeText(input);
      expect(result).not.toContain('script');
      expect(result).not.toContain('alert');
    });

    it('should preserve plain text content', () => {
      const input = '<div>Just plain text</div>';
      const result = sanitizeText(input);
      expect(result).toBe('Just plain text');
    });

    it('should handle complex HTML structures', () => {
      const input = '<div><p>Line 1</p><p>Line 2</p></div>';
      const result = sanitizeText(input);
      expect(result).not.toContain('<');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });

    it('should handle HTML entities', () => {
      const input = '<p>&lt;script&gt;alert()&lt;/script&gt;</p>';
      const result = sanitizeText(input);
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('wasSanitized()', () => {
    it('should detect when content was modified', () => {
      const original = '<p onclick="alert()">Text</p>';
      const sanitized = sanitizeHtml(original);
      expect(wasSanitized(original, sanitized)).toBe(true);
    });

    it('should return false when content unchanged', () => {
      const original = '<p>Safe text</p>';
      const sanitized = sanitizeHtml(original);
      expect(wasSanitized(original, sanitized)).toBe(false);
    });

    it('should detect dangerous content removal', () => {
      const original = '<script>alert("xss")</script>';
      const sanitized = sanitizeHtml(original);
      expect(wasSanitized(original, sanitized)).toBe(true);
    });

    it('should be case-sensitive', () => {
      const original = 'Text';
      const sanitized = 'text';
      expect(wasSanitized(original, sanitized)).toBe(true);
    });

    it('should handle empty strings', () => {
      expect(wasSanitized('', '')).toBe(false);
      expect(wasSanitized('text', '')).toBe(true);
    });

    it('should detect whitespace differences', () => {
      const original = 'Text with spaces';
      const sanitized = 'Text  with  spaces';
      expect(wasSanitized(original, sanitized)).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle user-generated content with mixed safe and unsafe HTML', () => {
      const userContent = `
        <h1>My Post</h1>
        <p>This is my <strong>amazing</strong> post!</p>
        <script>alert('hack')</script>
        <p onclick="steal()">Click here</p>
      `;

      const sanitized = sanitizeHtml(userContent);

      expect(sanitized).toContain('<h1>');
      expect(sanitized).toContain('<strong>');
      expect(sanitized).not.toContain('script');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('steal');
    });

    it('should handle comments in HTML', () => {
      const input = '<p>Text<!-- <script>alert()</script> -->More text</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('script');
    });

    it('should handle HTML with multiple encoding methods', () => {
      const inputs = [
        '<p onclick="alert()">Click</p>',
        '<p ONCLICK="alert()">Click</p>',
        '<p OnClick="alert()">Click</p>',
      ];

      inputs.forEach(input => {
        const result = sanitizeHtml(input);
        expect(result).not.toContain('alert');
      });
    });

    it('should handle deeply nested malicious HTML', () => {
      const input = '<div><div><div><script>alert("xss")</script></div></div></div>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('script');
      expect(result).toContain('div');
    });
  });
});
