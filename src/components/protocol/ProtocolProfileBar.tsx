import { Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BatteryProtocolProfile, ControllerProtocolProfile } from '../../types/platform';
import {
  activeBatteryProtocolProfile,
  activeControllerProtocolProfile,
  addProtocolProfileSections,
  initializeBatteryProtocolSections,
  initializeControllerProtocolSections,
  readProtocolProfiles,
  renameProtocolProfileSections,
  removeProtocolProfileSections,
  protocolProfileSectionsForSelection,
  updateProtocolProfileMetadataSections,
} from '../../features/protocol-profiles/protocolProfiles';
import type {
  ProtocolProfileIdError,
  ProtocolProfileScope,
} from '../../features/protocol-profiles/protocolProfiles';
import './protocol-profile.css';

interface ProtocolProfileBarProps {
  document: unknown;
  onUpdateSections: (sections: Record<string, unknown>) => void;
  scope: ProtocolProfileScope;
}

export function ProtocolProfileBar({ document, onUpdateSections, scope }: ProtocolProfileBarProps) {
  const { t } = useTranslation();
  const profilesDocument = readProtocolProfiles(document);
  const activeProfile =
    scope === 'controller'
      ? activeControllerProtocolProfile(document)
      : activeBatteryProtocolProfile(document);
  const profiles =
    scope === 'controller'
      ? (profilesDocument?.controller_profiles ?? [])
      : (profilesDocument?.battery_profiles ?? []);
  const title =
    scope === 'controller'
      ? t('protocolProfiles.controllerTitle')
      : t('protocolProfiles.batteryTitle');
  const description =
    scope === 'controller'
      ? t('protocolProfiles.controllerDescription')
      : t('protocolProfiles.batteryDescription');
  const activeLabel =
    scope === 'controller'
      ? t('protocolProfiles.activeController')
      : t('protocolProfiles.activeBattery');
  const familyLabel =
    scope === 'controller'
      ? t('protocolProfiles.controllerFamily')
      : t('protocolProfiles.batteryFamily');
  const revisionLabel =
    scope === 'controller'
      ? t('protocolProfiles.controllerRevision')
      : t('protocolProfiles.batteryRevision');
  const profileId =
    scope === 'controller'
      ? profilesDocument?.active_controller_profile_id
      : profilesDocument?.active_battery_profile_id;
  const activeProfileId = activeProfile?.profile_id ?? '';
  const [profileIdDraft, setProfileIdDraft] = useState(activeProfileId);
  const [profileIdError, setProfileIdError] = useState<ProtocolProfileIdError | undefined>();

  useEffect(() => {
    setProfileIdDraft(activeProfileId);
    setProfileIdError(undefined);
  }, [activeProfileId]);

  function updateMetadata(patch: Record<string, string>) {
    if (!activeProfile) return;
    onUpdateSections(
      updateProtocolProfileMetadataSections(document, scope, activeProfile.profile_id, patch),
    );
  }

  function commitProfileId() {
    if (!activeProfile) return;
    const result = renameProtocolProfileSections(
      document,
      scope,
      activeProfile.profile_id,
      profileIdDraft,
    );
    if (result.error) {
      setProfileIdError(result.error);
      return;
    }
    setProfileIdError(undefined);
    if (result.sections) onUpdateSections(result.sections);
  }

  function profileIdErrorText(error: ProtocolProfileIdError | undefined) {
    if (error === 'empty') return t('protocolProfiles.profileIdEmpty');
    if (error === 'too_long') return t('protocolProfiles.profileIdTooLong');
    if (error === 'duplicate') return t('protocolProfiles.profileIdDuplicate');
    return undefined;
  }

  const initialize =
    scope === 'controller'
      ? initializeControllerProtocolSections
      : initializeBatteryProtocolSections;
  const activeProfileFields = activeProfile as
    | ControllerProtocolProfile
    | BatteryProtocolProfile
    | null;

  return (
    <section className="protocol-profile-bar" aria-label={title}>
      <div className="protocol-profile-bar__heading">
        <span className="protocol-profile-bar__eyebrow">jc002</span>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      {!profilesDocument || !activeProfile ? (
        <div className="protocol-profile-bar__empty">
          <span>{t('protocolProfiles.notInitialized', { scope: title })}</span>
          <button type="button" onClick={() => onUpdateSections(initialize(document))}>
            <Plus aria-hidden="true" size={15} />
            {t('protocolProfiles.initialize')}
          </button>
        </div>
      ) : (
        <>
          <label className="protocol-profile-bar__select">
            <span>{activeLabel}</span>
            <select
              value={profileId}
              onChange={(event) =>
                onUpdateSections(
                  protocolProfileSectionsForSelection(document, scope, event.target.value),
                )
              }
            >
              {profiles.map((profile) => (
                <option key={profile.profile_id} value={profile.profile_id}>
                  {profile.profile_id} ·{' '}
                  {'controller_family' in profile
                    ? profile.controller_family
                    : profile.battery_family}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('protocolProfiles.profileId')}</span>
            <input
              aria-invalid={profileIdError ? true : undefined}
              value={profileIdDraft}
              onChange={(event) => {
                setProfileIdDraft(event.target.value);
                setProfileIdError(undefined);
              }}
              onBlur={commitProfileId}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitProfileId();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  setProfileIdDraft(activeProfile.profile_id);
                  setProfileIdError(undefined);
                  event.currentTarget.blur();
                }
              }}
            />
            {profileIdError ? (
              <small className="protocol-profile-bar__error">
                {profileIdErrorText(profileIdError)}
              </small>
            ) : null}
          </label>
          <label>
            <span>{familyLabel}</span>
            <input
              value={
                scope === 'controller'
                  ? (activeProfileFields as ControllerProtocolProfile).controller_family
                  : (activeProfileFields as BatteryProtocolProfile).battery_family
              }
              onChange={(event) =>
                updateMetadata(
                  scope === 'controller'
                    ? { controller_family: event.target.value }
                    : { battery_family: event.target.value },
                )
              }
            />
          </label>
          <label>
            <span>{revisionLabel}</span>
            <input
              value={
                scope === 'controller'
                  ? (activeProfileFields as ControllerProtocolProfile).controller_revision
                  : (activeProfileFields as BatteryProtocolProfile).battery_revision
              }
              onChange={(event) =>
                updateMetadata(
                  scope === 'controller'
                    ? { controller_revision: event.target.value }
                    : { battery_revision: event.target.value },
                )
              }
            />
          </label>
          <label>
            <span>{t('protocolProfiles.description')}</span>
            <input
              value={activeProfile.description ?? ''}
              onChange={(event) => updateMetadata({ description: event.target.value })}
            />
          </label>
          <div className="protocol-profile-bar__actions">
            <button
              title={t('protocolProfiles.clone')}
              type="button"
              onClick={() => onUpdateSections(addProtocolProfileSections(document, scope))}
            >
              <Copy aria-hidden="true" size={15} />
              <span>{t('protocolProfiles.clone')}</span>
            </button>
            <button
              className="protocol-profile-bar__danger"
              disabled={scope === 'controller' && profiles.length <= 1}
              title={t('protocolProfiles.remove')}
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    t('protocolProfiles.removeConfirm', { id: activeProfile.profile_id }),
                  )
                ) {
                  onUpdateSections(
                    removeProtocolProfileSections(document, scope, activeProfile.profile_id),
                  );
                }
              }}
            >
              <Trash2 aria-hidden="true" size={15} />
              <span>{t('protocolProfiles.remove')}</span>
            </button>
          </div>
          <span className="protocol-profile-bar__count">
            {t('protocolProfiles.count', { count: profiles.length })}
          </span>
        </>
      )}
    </section>
  );
}
