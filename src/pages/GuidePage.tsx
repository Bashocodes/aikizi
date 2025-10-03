import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
}

function AccordionItem({ title, children }: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-lg font-semibold text-gray-900 dark:text-white">{title}</span>
        <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-gray-700 dark:text-gray-300 leading-relaxed space-y-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export function GuidePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">Guide</h1>
          <p className="text-xl text-gray-700 dark:text-gray-300">Learn how to decode style and unlock creative potential</p>
        </div>

        <div className="space-y-4">
          <AccordionItem title="What is a Style Triplet?">
            <p>
              A Style Triplet is AIKIZI's unique three-part classification system that captures the essence of visual style.
              It consists of three descriptive terms separated by bullet points (e.g., "Minimalist • Geometric • Clean").
            </p>
            <p>
              Each component describes a different aspect of the visual style:
            </p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>First term:</strong> Overall aesthetic approach (e.g., Minimalist, Baroque, Abstract)</li>
              <li><strong>Second term:</strong> Visual characteristics or technique (e.g., Geometric, Organic, Textured)</li>
              <li><strong>Third term:</strong> Mood or impression (e.g., Clean, Dramatic, Ethereal)</li>
            </ul>
            <p>
              Style Triplets make it easy to search, filter, and discover images with similar visual qualities across the AIKIZI library.
            </p>
          </AccordionItem>

          <AccordionItem title="Subjects vs Tokens: What's the Difference?">
            <p>
              AIKIZI uses two complementary tagging systems to organize and categorize decoded images:
            </p>
            <h4 className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">Subjects</h4>
            <p>
              Subjects are high-level categorical labels that describe <strong>what</strong> is in the image.
              Examples include "architecture," "portrait," "landscape," "product,\" or "abstract."
            </p>
            <p>
              Subjects help you browse by content type and are ideal for discovering images within specific domains.
            </p>
            <h4 className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">Tokens</h4>
            <p>
              Tokens are granular descriptive keywords that capture specific visual elements, techniques, moods,
              or attributes. Examples include "symmetry," "golden-hour," "bokeh," "vintage," or "high-contrast."
            </p>
            <p>
              Tokens provide detailed search capabilities and help you find images with very specific characteristics.
              Multiple tokens can be combined to narrow down your search with precision.
            </p>
          </AccordionItem>

          <AccordionItem title="How Does SREF Unlock Work?">
            <p>
              SREF (Style Reference) codes are special MidJourney parameters that allow you to recreate a specific visual style in your own AI-generated images.
            </p>
            <h4 className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">Why Are SREFs Locked?</h4>
            <p>
              SREF codes represent significant value for creators and require computational resources to generate.
              By locking them behind a token cost, AIKIZI ensures sustainable operation and fair access to premium features.
            </p>
            <h4 className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">How to Unlock</h4>
            <ol className="list-decimal list-inside ml-4 space-y-2">
              <li>Navigate to any post detail page</li>
              <li>Scroll to the SREF Code section (marked with a lock icon)</li>
              <li>Click "Unlock for 1 token" (or the specified token amount)</li>
              <li>The code will be revealed and you can copy it to your clipboard</li>
              <li>Use the SREF code in your MidJourney prompts (e.g., "/imagine your prompt --sref sref_abc123xyz")</li>
            </ol>
            <h4 className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">Once Unlocked</h4>
            <p>
              Once you unlock a SREF for a specific post, it remains unlocked for your account permanently.
              You can return to that post anytime to copy the code again without spending additional tokens.
            </p>
          </AccordionItem>

          <AccordionItem title="How Do Tokens Work?">
            <p>
              Tokens are AIKIZI's internal currency for accessing premium features. Every new user receives 1,000 free tokens upon sign-up.
            </p>
            <h4 className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">Token Costs</h4>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>Decode Image:</strong> 1 token per image</li>
              <li><strong>Unlock SREF:</strong> 1 token per post (one-time unlock)</li>
              <li><strong>Download Image:</strong> Free (no tokens required)</li>
            </ul>
            <h4 className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">Getting More Tokens</h4>
            <p>
              Pro users receive 10,000 tokens. Payment and renewal features will be available soon via the pricing page.
            </p>
          </AccordionItem>

          <AccordionItem title="Who Are Publishers?">
            <p>
              Publishers are curated AIKIZI accounts with permission to post decoded images publicly to the Explore gallery.
              Regular users can decode images privately for their own reference library, but only publishers can share content with the community.
            </p>
            <p>
              Publisher accounts are manually approved by the AIKIZI team to ensure high-quality content and maintain
              the integrity of the public library. You can browse publisher profiles to see their full collections and
              discover trending styles from trusted creators.
            </p>
          </AccordionItem>
        </div>
      </div>
    </div>
  );
}
