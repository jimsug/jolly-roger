import { useTracker } from "meteor/react-meteor-data";
import { faInfo } from "@fortawesome/free-solid-svg-icons/faInfo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import type { FormProps } from "react-bootstrap/Form";
import Form from "react-bootstrap/Form";
import FormCheck from "react-bootstrap/FormCheck";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormText from "react-bootstrap/FormText";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import { createPortal } from "react-dom";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import type { MultiValue } from "react-select";
import Select from "react-select";
import { useTheme } from "styled-components";
import { DEFAULT_HUNT_TAGS, parseInitialTags } from "../../lib/defaultHuntTags";
import DiscordCache from "../../lib/models/DiscordCache";
import type {
  EditableHuntType,
  HuntDefaultRole,
  SavedDiscordObjectType,
} from "../../lib/models/Hunts";
import Hunts, { HUNT_DEFAULT_ROLES } from "../../lib/models/Hunts";
import Settings from "../../lib/models/Settings";
import discordChannelsForConfiguredGuild from "../../lib/publications/discordChannelsForConfiguredGuild";
import discordRolesForConfiguredGuild from "../../lib/publications/discordRolesForConfiguredGuild";
import settingsByName from "../../lib/publications/settingsByName";
import createHunt from "../../methods/createHunt";
import updateHunt from "../../methods/updateHunt";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import ActionButtonRow from "./ActionButtonRow";
import Markdown from "./Markdown";

enum SubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  SUCCESS = "success",
  FAILED = "failed",
}

type RoleSelectOption = { value: HuntDefaultRole; label: string };

const splitLists = function (lists: string): string[] {
  const strippedLists = lists.trim();
  if (strippedLists === "") {
    return [];
  }

  return strippedLists.split(/[, ]+/);
};

const emptyToUndefined = (value: string): string | undefined =>
  value === "" ? undefined : value;

interface DiscordSelectorParams {
  disable: boolean;
  value: SavedDiscordObjectType | undefined;
  onChange: (next: SavedDiscordObjectType | undefined) => void;
}

interface DiscordSelectorProps extends DiscordSelectorParams {
  loading: boolean;
  options: SavedDiscordObjectType[];
}

const DiscordSelector = ({
  disable,
  value,
  onChange,
  loading,
  options,
}: DiscordSelectorProps) => {
  const { t } = useTranslation();

  const onValueChanged: NonNullable<FormControlProps["onChange"]> = useCallback(
    (e) => {
      if (e.currentTarget.value === "empty") {
        onChange(undefined);
      } else {
        const match = options.find((obj) => {
          return obj.id === e.currentTarget.value;
        });
        if (match) {
          onChange(match);
        }
      }
    },
    [onChange, options],
  );

  const formOptions = useCallback((): SavedDiscordObjectType[] => {
    // List of the options.  Be sure to include the saved option if it's (for
    // some reason) not present in the channel list.
    const noneOption = {
      id: "empty",
      name: "disabled",
    } as SavedDiscordObjectType;

    if (value && !options.some((opt) => opt.id === value.id)) {
      return [noneOption, value, ...options];
    }
    return [noneOption, ...options];
  }, [value, options]);

  if (loading) {
    return (
      <div>{t("huntEdit.loadingDiscord", "Loading discord resources")}...</div>
    );
  } else {
    return (
      <FormControl
        as="select"
        type="text"
        value={value?.id}
        disabled={disable}
        onChange={onValueChanged}
      >
        {formOptions().map(({ id, name }) => {
          return (
            <option key={id} value={id}>
              {name}
            </option>
          );
        })}
      </FormControl>
    );
  }
};

const DiscordChannelSelector = ({
  guildId,
  ...rest
}: DiscordSelectorParams & { guildId: string }) => {
  const cacheLoading = useTypedSubscribe(discordChannelsForConfiguredGuild);
  const loading = cacheLoading();

  const { options } = useTracker(() => {
    const discordChannels: SavedDiscordObjectType[] = DiscordCache.find(
      {
        type: "channel",
        "object.guild": guildId,
        // We want only text channels, since those are the only ones we can
        // bridge chat messages to. (0 is GUILD_TEXT, but we can't import
        // discordjs into client code because of server-only dependencies)
        "object.type": 0,
      },
      {
        // We want to sort them in the same order they're provided in the Discord UI.
        sort: { "object.rawPosition": 1 },
        projection: { "object.id": 1, "object.name": 1 },
      },
    ).map((c) => c.object as SavedDiscordObjectType);

    return {
      options: discordChannels,
    };
  }, [guildId]);
  return <DiscordSelector loading={loading} options={options} {...rest} />;
};

const DiscordRoleSelector = ({
  guildId,
  ...rest
}: DiscordSelectorParams & { guildId: string }) => {
  const cacheLoading = useTypedSubscribe(discordRolesForConfiguredGuild);
  const loading = cacheLoading();
  const { options } = useTracker(() => {
    const discordRoles: SavedDiscordObjectType[] = DiscordCache.find(
      {
        type: "role",
        "object.guild": guildId,
        // The role whose id is the same as the guild is the @everyone role, don't want that
        "object.id": { $ne: guildId },
        // Managed roles are owned by an integration
        "object.managed": false,
      },
      {
        // We want to sort them in the same order they're provided in the Discord UI.
        sort: { "object.rawPosition": 1 },
        projection: { "object.id": 1, "object.name": 1 },
      },
    ).map((c) => c.object as SavedDiscordObjectType);

    return {
      options: discordRoles,
    };
  }, [guildId]);
  return <DiscordSelector loading={loading} options={options} {...rest} />;
};

const HuntEditPage = () => {
  const huntId = useParams<{ huntId: string }>().huntId;
  const hunt = useTracker(
    () => (huntId ? Hunts.findOne(huntId) : null),
    [huntId],
  );

  const { t } = useTranslation();
  const theme = useTheme();

  useBreadcrumb({
    title: huntId
      ? t("huntEdit.title.edit", "Edit Hunt")
      : t("huntEdit.title.new", "Create Hunt"),
    path: `/hunts/${huntId ? `${huntId}/edit` : "new"}`,
  });

  useTypedSubscribe(settingsByName, { name: "discord.guild" });
  const guildId = useTracker(() => {
    const setting = Settings.findOne({ name: "discord.guild" });
    return setting?.value.guild.id;
  }, []);

  // New hunts start with the admin-configured default tags, falling back to
  // the built-in list. Until the field is edited we send nothing and let the
  // server apply the same default, so the two can't disagree.
  useTypedSubscribe(huntId ? undefined : settingsByName, {
    name: "server.settings",
  });
  const defaultInitialTags = useTracker(() => {
    const setting = Settings.findOne({ name: "server.settings" });
    return setting?.value.defaultHuntTags ?? DEFAULT_HUNT_TAGS.join(", ");
  }, []);

  const navigate = useNavigate();

  const footer = useRef<HTMLDivElement>(null);

  const [submitState, setSubmitState] = useState(SubmitState.IDLE);
  const [errorMessage, setErrorMessage] = useState("");

  const [name, setName] = useState(hunt?.name ?? "");
  const [initialTags, setInitialTags] = useState<string | undefined>(undefined);
  const [mailingLists, setMailingLists] = useState(
    hunt?.mailingLists.join(", ") ?? "",
  );
  const [signupMessage, setSignupMessage] = useState(hunt?.signupMessage ?? "");
  const [moreInfo, setMoreInfo] = useState(hunt?.moreInfo ?? "");
  const [defaultRoles, setDefaultRoles] = useState<HuntDefaultRole[]>(
    hunt?.defaultRoles ?? [],
  );
  const [openSignups, setOpenSignups] = useState(hunt?.openSignups ?? false);
  const [hasGuessQueue, setHasGuessQueue] = useState(
    hunt?.hasGuessQueue ?? true,
  );
  const [allowUnlockablePuzzles, setAllowUnlockablePuzzles] = useState(
    hunt?.allowUnlockablePuzzles ?? false,
  );
  const [termsOfUse, setTermsOfUse] = useState(hunt?.termsOfUse ?? "");
  const [showTermsOfUsePreview, setShowTermsOfUsePreview] = useState(false);
  const toggleShowTermsOfUsePreview = useCallback(
    () => setShowTermsOfUsePreview((prev) => !prev),
    [],
  );
  const [homepageUrl, setHomepageUrl] = useState(hunt?.homepageUrl ?? "");
  const [isArchived, setIsArchived] = useState(hunt?.isArchived ?? false);
  const [archivedHuntUrl, setArchivedHuntUrl] = useState(
    hunt?.archivedHuntUrl ?? "",
  );
  const [submitTemplate, setSubmitTemplate] = useState(
    hunt?.submitTemplate ?? "",
  );
  const [customLinkName, setCustomLinkName] = useState(
    hunt?.customLinkName ?? "",
  );
  const [customLinkUrl, setCustomLinkUrl] = useState(hunt?.customLinkUrl ?? "");
  const [customLinkEmbed, setCustomLinkEmbed] = useState(
    hunt?.customLinkEmbed ?? false,
  );
  const [announcementDiscordChannel, setAnnouncementDiscordChannel] = useState(
    hunt?.announcementDiscordChannel,
  );
  const [puzzleCreationDiscordChannel, setPuzzleCreationDiscordChannel] =
    useState(hunt?.puzzleCreationDiscordChannel);
  const [puzzleHooksDiscordChannel, setPuzzleHooksDiscordChannel] = useState(
    hunt?.puzzleHooksDiscordChannel,
  );
  const [firehoseDiscordChannel, setFirehoseDiscordChannel] = useState(
    hunt?.firehoseDiscordChannel,
  );
  const [memberDiscordRole, setMemberDiscordRole] = useState(
    hunt?.memberDiscordRole,
  );

  const onNameChanged = useCallback<NonNullable<FormControlProps["onChange"]>>(
    (e) => {
      setName(e.currentTarget.value);
    },
    [],
  );

  const onInitialTagsChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setInitialTags(e.currentTarget.value);
  }, []);

  const onMailingListsChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setMailingLists(e.currentTarget.value);
  }, []);

  const onSignupMessageChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setSignupMessage(e.currentTarget.value);
  }, []);

  const onMoreInfoChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setMoreInfo(e.currentTarget.value);
  }, []);

  const onDefaultRolesChanged = useCallback(
    (value: MultiValue<RoleSelectOption>) => {
      setDefaultRoles(value.map((v) => v.value));
    },
    [],
  );

  const onOpenSignupsChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setOpenSignups(e.currentTarget.checked);
    },
    [],
  );

  const onHasGuessQueueChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasGuessQueue(e.currentTarget.checked);
    },
    [],
  );

  const onAllowUnlockablePuzzlesChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAllowUnlockablePuzzles(e.currentTarget.checked);
    },
    [],
  );

  const onTermsOfUseChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setTermsOfUse(e.currentTarget.value);
  }, []);

  const onHomepageUrlChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setHomepageUrl(e.currentTarget.value);
  }, []);

  const onIsArchivedChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsArchived(e.currentTarget.checked);
    },
    [],
  );

  const onArchivedHuntUrlChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setArchivedHuntUrl(e.currentTarget.value);
  }, []);

  const onSubmitTemplateChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setSubmitTemplate(e.currentTarget.value);
  }, []);

  const onCustomLinkNameChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setCustomLinkName(e.currentTarget.value);
  }, []);

  const onCustomLinkUrlChanged = useCallback<
    NonNullable<FormControlProps["onChange"]>
  >((e) => {
    setCustomLinkUrl(e.currentTarget.value);
  }, []);

  const onCustomLinkEmbedChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomLinkEmbed(e.currentTarget.checked);
    },
    [],
  );

  const onAnnnouncementDiscordChannelChanged = useCallback(
    (next: SavedDiscordObjectType | undefined) => {
      setAnnouncementDiscordChannel(next);
    },
    [],
  );

  const onPuzzleCreationDiscordChannelChanged = useCallback(
    (next: SavedDiscordObjectType | undefined) => {
      setPuzzleCreationDiscordChannel(next);
    },
    [],
  );

  const onPuzzleHooksDiscordChannelChanged = useCallback(
    (next: SavedDiscordObjectType | undefined) => {
      setPuzzleHooksDiscordChannel(next);
    },
    [],
  );

  const onFirehoseDiscordChannelChanged = useCallback(
    (next: SavedDiscordObjectType | undefined) => {
      setFirehoseDiscordChannel(next);
    },
    [],
  );

  const onMemberDiscordRoleChanged = useCallback(
    (next: SavedDiscordObjectType | undefined) => {
      setMemberDiscordRole(next);
    },
    [],
  );

  const onFormCallback = useCallback(
    (error?: Error, newHuntId?: string) => {
      if (error) {
        setErrorMessage(error.message);
        setSubmitState(SubmitState.FAILED);
      } else {
        setSubmitState(SubmitState.SUCCESS);
        setErrorMessage("");

        // If there's a result, that means we created a new hunt - redirect to it.
        // Otherwise stay on this page and let people navigate themselves
        if (newHuntId) {
          void navigate(`/hunts/${newHuntId}`);
        }
      }

      setTimeout(() => {
        // Scroll to bottom of the page so people can see whatever banners we show
        footer.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    },
    [navigate],
  );

  const onFormSubmit = useCallback<NonNullable<FormProps["onSubmit"]>>(
    (e) => {
      e.preventDefault();
      setSubmitState(SubmitState.SUBMITTING);
      const state: EditableHuntType = {
        name,
        mailingLists: splitLists(mailingLists),
        signupMessage: emptyToUndefined(signupMessage),
        moreInfo: emptyToUndefined(moreInfo),
        openSignups,
        hasGuessQueue,
        defaultRoles,
        allowUnlockablePuzzles,
        termsOfUse: emptyToUndefined(termsOfUse),
        homepageUrl: emptyToUndefined(homepageUrl),
        isArchived,
        archivedHuntUrl: emptyToUndefined(archivedHuntUrl),
        submitTemplate: emptyToUndefined(submitTemplate),
        customLinkName: emptyToUndefined(customLinkName),
        customLinkUrl: emptyToUndefined(customLinkUrl),
        customLinkEmbed,
        announcementDiscordChannel,
        puzzleCreationDiscordChannel,
        puzzleHooksDiscordChannel,
        firehoseDiscordChannel,
        memberDiscordRole,
      };

      if (huntId) {
        updateHunt.call({ huntId, value: state }, onFormCallback);
      } else {
        createHunt.call(
          {
            ...state,
            initialTags:
              initialTags === undefined
                ? undefined
                : parseInitialTags(initialTags),
          },
          onFormCallback,
        );
      }
    },
    [
      huntId,
      name,
      initialTags,
      mailingLists,
      signupMessage,
      moreInfo,
      openSignups,
      hasGuessQueue,
      defaultRoles,
      allowUnlockablePuzzles,
      termsOfUse,
      homepageUrl,
      isArchived,
      archivedHuntUrl,
      submitTemplate,
      customLinkName,
      customLinkUrl,
      customLinkEmbed,
      announcementDiscordChannel,
      puzzleCreationDiscordChannel,
      puzzleHooksDiscordChannel,
      firehoseDiscordChannel,
      memberDiscordRole,
      onFormCallback,
    ],
  );

  const onSuccessDismiss = useCallback(
    () => setSubmitState(SubmitState.IDLE),
    [],
  );

  const disableForm = submitState === SubmitState.SUBMITTING;

  const termsOfUsePreview = createPortal(
    <Modal
      show={showTermsOfUsePreview}
      size="lg"
      onHide={toggleShowTermsOfUsePreview}
    >
      <Modal.Body>
        <Markdown text={termsOfUse} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={toggleShowTermsOfUsePreview}>
          {t("common.close", "Close")}
        </Button>
      </Modal.Footer>
    </Modal>,
    document.body,
  );

  const idPrefix = useId();

  const roleOptions = useMemo(() => {
    const labels: Record<HuntDefaultRole, string> = {
      operator: t("hunterList.operator", "Operator"),
    };
    return HUNT_DEFAULT_ROLES.map(
      (role): RoleSelectOption => ({ value: role, label: labels[role] }),
    );
  }, [t]);
  const selectedRoleOptions = useMemo(
    () => roleOptions.filter((option) => defaultRoles.includes(option.value)),
    [roleOptions, defaultRoles],
  );

  return (
    <Container>
      <h1>
        {huntId
          ? t("huntEdit.title.edit", "Edit Hunt")
          : t("huntEdit.title.new", "New Hunt")}
      </h1>

      <Form onSubmit={onFormSubmit}>
        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-name`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.name", "Name")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              value={name}
              onChange={onNameChanged}
              disabled={disableForm}
            />
          </Col>
        </FormGroup>

        {!huntId && (
          <FormGroup
            as={Row}
            className="mb-3"
            controlId={`${idPrefix}-hunt-form-initial-tags`}
          >
            <FormLabel column xs={3}>
              {t("huntEdit.initialTags.field", "Initial tags")}
            </FormLabel>
            <Col xs={9}>
              <FormControl
                type="text"
                value={initialTags ?? defaultInitialTags}
                onChange={onInitialTagsChanged}
                disabled={disableForm}
              />
              <FormText>
                {t(
                  "huntEdit.initialTags.help",
                  `These (comma-separated) tags will be created along with
                  the hunt. Leave this blank to start without any tags.`,
                )}
              </FormText>
            </Col>
          </FormGroup>
        )}

        <h3>{t("huntEdit.usersAndPermissions", "Users and permissions")}</h3>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-signup-message`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.signupMessage.field", "Signup message")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              as="textarea"
              value={signupMessage}
              onChange={onSignupMessageChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.signupMessage.help",
                `This message (rendered as markdown) will be shown to users who
                aren't part of the hunt. This is a good place to put directions
                for how to sign up.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-more-info`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.moreInfo.field", "More information")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              as="textarea"
              value={moreInfo}
              onChange={onMoreInfoChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.moreInfo.help",
                `This message (rendered as markdown) will be shown to members
                on the hunt's More page. It's a good place for links to
                resources and other static information. Anyone signed in to
                Jolly Roger can read it, so don't put anything private here.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-default-roles`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.defaultRoles.field", "Default roles")}
          </FormLabel>
          <Col xs={9}>
            <Select
              inputId={`${idPrefix}-hunt-form-default-roles`}
              isMulti
              isDisabled={disableForm}
              options={roleOptions}
              value={selectedRoleOptions}
              onChange={onDefaultRolesChanged}
              theme={theme.reactSelectTheme}
            />
            <FormText>
              {t(
                "huntEdit.defaultRoles.help",
                `Every member of this hunt gets these roles' permissions
                without the roles being assigned to their accounts, but not
                operator notifications (guesses to check, @operator mentions)
                or the right to promote and demote operators.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-open-signups`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.openInvites.field", "Open invites")}
          </FormLabel>
          <Col xs={9}>
            <FormCheck
              id={`${idPrefix}-hunt-form-open-signups`}
              checked={openSignups}
              onChange={onOpenSignupsChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.openInvites.help",
                `If open invites are enabled, then any current member of the
                hunt can add a new member to the hunt. Otherwise, only
                admins can add new members.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-has-guess-queue`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.guessQueue.field", "Guess queue")}
          </FormLabel>
          <Col xs={9}>
            <FormCheck
              id={`${idPrefix}-hunt-form-has-guess-queue`}
              checked={hasGuessQueue}
              onChange={onHasGuessQueueChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.guessQueue.help",
                `If enabled, users can submit guesses for puzzles but
                operators must mark them as correct. If disabled, any user can
                enter the puzzle answer.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-allow-unlockable-puzzles`}
        >
          <FormLabel column xs={3}>
            {t(
              "huntEdit.allowUnlockablePuzzles.field",
              "Allow unlockable puzzles",
            )}
          </FormLabel>
          <Col xs={9}>
            <FormCheck
              id={`${idPrefix}-hunt-form-allow-unlockable-puzzles`}
              checked={allowUnlockablePuzzles}
              onChange={onAllowUnlockablePuzzlesChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.allowUnlockablePuzzles.help",
                `If enabled, puzzles can be added in a locked state and
                members can vote on which to unlock. If disabled, all puzzles
                are created unlocked.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-terms-of-use`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.termsOfUse.field", "Terms of use")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              as="textarea"
              value={termsOfUse}
              onChange={onTermsOfUseChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.termsOfUse.help",
                `If specified, this text (rendered as Markdown) will be shown
                to users when the first visit the hunt website, and they will
                be required to accept it before they can proceed.`,
              )}
              <ActionButtonRow>
                <Button
                  variant="secondary"
                  onClick={toggleShowTermsOfUsePreview}
                >
                  {t("huntEdit.termsOfUse.preview", "Preview")}
                </Button>
              </ActionButtonRow>
            </FormText>
          </Col>
        </FormGroup>

        {termsOfUsePreview}

        <h3>{t("huntEdit.huntWebsite", "Hunt website")}</h3>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-homepage-url`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.url.field", "Homepage URL")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              value={homepageUrl}
              onChange={onHomepageUrlChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.url.help",
                "If provided, a link to the hunt homepage will be placed on the landing page.",
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-is-archived`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.archived.field", "Archived")}
          </FormLabel>
          <Col xs={9}>
            <FormCheck
              id={`${idPrefix}-hunt-form-is-archived`}
              checked={isArchived}
              onChange={onIsArchivedChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.archived.help",
                `If archived, this hunt is listed below active hunts on the
                hunt list. It otherwise works as normal.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-archived-hunt-url`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.archivedUrl.field", "Archive URL")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              value={archivedHuntUrl}
              onChange={onArchivedHuntUrlChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.archivedUrl.help",
                `If provided, this replaces the homepage URL as the hunt link
                in the navigation bar, e.g. once the hunt site has moved to an
                archive.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-submit-template`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.submitUrlTemplate.field", "Submit URL template")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              value={submitTemplate}
              onChange={onSubmitTemplateChanged}
              disabled={disableForm}
            />
            <FormText>
              <Trans
                i18nKey="huntEdit.submitUrlTemplate.help"
                t={t}
                components={{
                  MustacheLink: (
                    // oxlint-disable-next-line jsx-a11y/anchor-has-content -- i18next Trans fills in content
                    <a href="https://mustache.github.io/mustache.5.html" />
                  ),
                  parsedUrlLink: (
                    // oxlint-disable-next-line jsx-a11y/anchor-has-content -- i18next Trans fills in content
                    <a href="https://developer.mozilla.org/en-US/docs/Web/API/URL" />
                  ),
                  code: <code />,
                }}
                defaults={`If provided, this <MustacheLink>Mustache template</MustacheLink>
                          is used to generate the link to the guess submission page. It gets
                          as context a <parsedUrlLink>parsed URL</parsedUrlLink>, providing
                          variables like <code>hostname</code> or <code>pathname</code>.
                          Because this will be used as a link directly, make sure to use
                          "triple-mustaches" so that the URL components aren't escaped. As an
                          example, setting this to <code>{{{origin}}}/submit{{{pathname}}}</code>
                          would work for the 2018 Mystery Hunt. If not specified, the puzzle
                          URL is used as the link to the guess submission page.`}
              />
            </FormText>
          </Col>
        </FormGroup>

        <h4>{t("huntEdit.customLink.heading", "Custom navigation link")}</h4>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-custom-link-name`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.customLink.name.field", "Link name")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              value={customLinkName}
              onChange={onCustomLinkNameChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.customLink.name.help",
                `If a name and URL are both provided, an extra link with this
                name is shown in the hunt navigation bar.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-custom-link-url`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.customLink.url.field", "Link URL")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              value={customLinkUrl}
              onChange={onCustomLinkUrlChanged}
              disabled={disableForm}
            />
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-custom-link-embed`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.customLink.embed.field", "Embed link")}
          </FormLabel>
          <Col xs={9}>
            <FormCheck
              id={`${idPrefix}-hunt-form-custom-link-embed`}
              type="switch"
              checked={customLinkEmbed}
              onChange={onCustomLinkEmbedChanged}
              disabled={disableForm}
              label={
                customLinkEmbed
                  ? t("huntEdit.customLink.embed.enabled", "Embedded")
                  : t("huntEdit.customLink.embed.disabled", "Opens in new tab")
              }
            />
            <FormText>
              {t(
                "huntEdit.customLink.embed.help",
                `If enabled, the linked page is embedded inside Jolly Roger.
                Otherwise it opens in a new tab.`,
              )}
            </FormText>
          </Col>
        </FormGroup>

        <h3>{t("huntEdit.externalIntegrations", "External integrations")}</h3>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-hunt-form-mailing-lists`}
        >
          <FormLabel column xs={3}>
            {t("huntEdit.mailingLists.field", "Mailing lists")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              value={mailingLists}
              onChange={onMailingListsChanged}
              disabled={disableForm}
            />
            <FormText>
              {t(
                "huntEdit.mailingLists.help",
                "Users joining this hunt will be automatically added to all of these (comma-separated) lists",
              )}
            </FormText>
          </Col>
        </FormGroup>

        {guildId ? (
          <>
            <FormGroup
              as={Row}
              className="mb-3"
              controlId={`${idPrefix}-hunt-form-announcement-discord-channel`}
            >
              <FormLabel column xs={3}>
                {t(
                  "huntEdit.announcementChannel.field",
                  "Hunt announcements Discord channel",
                )}
              </FormLabel>
              <Col xs={9}>
                <DiscordChannelSelector
                  guildId={guildId}
                  disable={disableForm}
                  value={announcementDiscordChannel}
                  onChange={onAnnnouncementDiscordChannelChanged}
                />
                <FormText>
                  {t(
                    "huntEdit.announcementChannel.help",
                    "If this field is specified, announcements made on Jolly Roger will be mirrored to this channel.",
                  )}
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup
              as={Row}
              className="mb-3"
              controlId={`${idPrefix}-hunt-form-puzzle-creation-discord-channel`}
            >
              <FormLabel column xs={3}>
                {t(
                  "huntEdit.puzzleCreationChannel.field",
                  "Puzzle creation Discord channel",
                )}
              </FormLabel>
              <Col xs={9}>
                <DiscordChannelSelector
                  guildId={guildId}
                  disable={disableForm}
                  value={puzzleCreationDiscordChannel}
                  onChange={onPuzzleCreationDiscordChannelChanged}
                />
                <FormText>
                  {t(
                    "huntEdit.puzzleCreationChannel.help",
                    `If this field is specified, when a puzzle in this hunt is
                    added, a message will be sent to the specified channel
                    instead of the puzzle notifications channel.`,
                  )}
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup
              as={Row}
              className="mb-3"
              controlId={`${idPrefix}-hunt-form-puzzle-hooks-discord-channel`}
            >
              <FormLabel column xs={3}>
                {t(
                  "huntEdit.puzzleChannel.field",
                  "Puzzle notifications Discord channel",
                )}
              </FormLabel>
              <Col xs={9}>
                <DiscordChannelSelector
                  guildId={guildId}
                  disable={disableForm}
                  value={puzzleHooksDiscordChannel}
                  onChange={onPuzzleHooksDiscordChannelChanged}
                />
                <FormText>
                  {t(
                    "huntEdit.puzzleChannel.help",
                    `If this field is specified, when a puzzle in this hunt is
                    solved, a message will be sent to the specified channel.
                    Puzzle creation messages also go here unless a puzzle
                    creation channel is set.`,
                  )}
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup
              as={Row}
              className="mb-3"
              controlId={`${idPrefix}-hunt-form-firehose-discord-channel`}
            >
              <FormLabel column xs={3}>
                {t(
                  "huntEdit.firehoseChannel.field",
                  "Firehose Discord channel",
                )}
              </FormLabel>
              <Col xs={9}>
                <DiscordChannelSelector
                  guildId={guildId}
                  disable={disableForm}
                  value={firehoseDiscordChannel}
                  onChange={onFirehoseDiscordChannelChanged}
                />
                <FormText>
                  {t(
                    "huntEdit.firehoseChannel.help",
                    `If this field is specified, all chat messages written in
                    puzzles associated with this hunt will be mirrored to the
                    specified Discord channel. Puzzle renames are posted here
                    too.`,
                  )}
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup
              as={Row}
              className="mb-3"
              controlId={`${idPrefix}-hunt-form-member-discord-role`}
            >
              <FormLabel column xs={3}>
                {t("huntEdit.discordRole.field", "Discord role for members")}
              </FormLabel>
              <Col xs={9}>
                <DiscordRoleSelector
                  guildId={guildId}
                  disable={disableForm}
                  value={memberDiscordRole}
                  onChange={onMemberDiscordRoleChanged}
                />
                <FormText>
                  {t(
                    "huntEdit.discordRole.help",
                    `If set, then members of the hunt that have linked their
                  Discord profile are added to the specified Discord role. Note
                  that for continuity, if this setting is changed, Jolly Roger
                  will not touch the old role (e.g. to remove members)`,
                  )}
                </FormText>
              </Col>
            </FormGroup>
          </>
        ) : (
          <Alert variant="info">
            <FontAwesomeIcon icon={faInfo} />
            {t(
              "huntEdit.discordNotConfigured",
              "Discord has not been configured, so Discord settings are disabled.",
            )}
          </Alert>
        )}

        <div ref={footer}>
          {submitState === SubmitState.FAILED && (
            <Alert variant="danger">{errorMessage}</Alert>
          )}
          {submitState === SubmitState.SUCCESS && (
            <Alert variant="success" dismissible onClose={onSuccessDismiss}>
              {t(
                "huntEdit.saveSuccess",
                "Hunt information successfully updated",
              )}
            </Alert>
          )}

          <ActionButtonRow>
            <FormGroup className="mb-3">
              <Button variant="primary" type="submit" disabled={disableForm}>
                {huntId
                  ? t("common.save", "Save")
                  : t("huntEdit.create", "Create")}
              </Button>
            </FormGroup>
          </ActionButtonRow>
        </div>
      </Form>
    </Container>
  );
};

export default HuntEditPage;
