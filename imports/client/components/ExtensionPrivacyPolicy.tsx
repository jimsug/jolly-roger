import { useTranslation } from "react-i18next";

// Public, so anyone can read it without signing in, such as someone deciding
// whether to install the browser extension
const ExtensionPrivacyPolicy = () => {
  const { t } = useTranslation();

  return (
    <>
      <h1>
        {t(
          "extensionPrivacy.title",
          "Jolly Roger browser extension privacy policy",
        )}
      </h1>
      <h2>
        {t("extensionPrivacy.collect.heading", "What user data we collect")}
      </h2>
      <p>
        {t(
          "extensionPrivacy.collect.intro",
          "When you use the extension, we may collect:",
        )}
      </p>
      <ul>
        <li>
          {t(
            "extensionPrivacy.collect.authentication",
            "Authentication information, so we can confirm you're authorized to take actions on the website; and",
          )}
        </li>
        <li>
          {t(
            "extensionPrivacy.collect.websiteContent",
            "Website content, including links, anchor text, and page titles.",
          )}
        </li>
      </ul>
      <p>
        {t(
          "extensionPrivacy.collect.summary",
          "We detail what we collect, and how, below. We only collect and store what is reasonably necessary to facilitate puzzle-solving. We definitely don't use your data for advertising, or sell it to anyone.",
        )}
      </p>
      <h2>{t("extensionPrivacy.use.heading", "How we use it")}</h2>
      <ul>
        <li>
          {t(
            "extensionPrivacy.use.currentUrl",
            "When you activate the extension, we may automatically send the URL of the page you are currently on to our servers;",
          )}
        </li>
        <li>
          {t(
            "extensionPrivacy.use.pageDetails",
            "When you choose to, we may send the current page URL and title to our servers; and",
          )}
        </li>
        <li>
          {t(
            "extensionPrivacy.use.links",
            "When you choose to, we may send all or some of the hyperlinks and anchor text currently on the page to our servers.",
          )}
        </li>
      </ul>
    </>
  );
};

export default ExtensionPrivacyPolicy;
