export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">Privacy Policy</h1>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">1. Information We Collect</h2>
            <p>
              AIKIZI collects information you provide directly, including your Google account information when you sign in,
              images you upload for decoding, and usage data as you interact with the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">2. How We Use Your Information</h2>
            <p>
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li>Provide, maintain, and improve AIKIZI services</li>
              <li>Process and analyze images you upload</li>
              <li>Manage your token balance and transactions</li>
              <li>Send you technical notices and support messages</li>
              <li>Monitor and analyze usage patterns to improve the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">3. Image Privacy</h2>
            <p>
              Images you decode privately remain private to your account unless you choose to publish them (publisher accounts only).
              We use AI models to analyze your images, but human reviewers do not access your private decodes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">4. Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share your information with:
            </p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li>Service providers who assist in operating AIKIZI (e.g., cloud hosting, AI model APIs)</li>
              <li>Law enforcement if required by law</li>
              <li>Other parties with your explicit consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">5. Data Security</h2>
            <p>
              We use industry-standard security measures to protect your data, including encryption in transit and at rest.
              However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">6. Cookies and Tracking</h2>
            <p>
              AIKIZI uses cookies and similar tracking technologies to maintain your session and analyze platform usage.
              You can control cookies through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">7. Third-Party Services</h2>
            <p>
              AIKIZI integrates with third-party services including Google OAuth for authentication, Cloudflare for image hosting,
              and AI model providers. These services have their own privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">8. Your Rights</h2>
            <p>
              You have the right to:
            </p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your data in a portable format</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">9. Children's Privacy</h2>
            <p>
              AIKIZI is not intended for users under 13 years of age. We do not knowingly collect information from children.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">10. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of significant changes by posting
              the new policy on this page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">11. Contact Us</h2>
            <p>
              For questions about this privacy policy, please contact us at privacy@aikizi.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
