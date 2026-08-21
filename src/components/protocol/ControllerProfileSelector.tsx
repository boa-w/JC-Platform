import { CircuitBoard, Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  activeControllerProtocolProfile,
  addProtocolProfileSections,
  createNewProtocolProfileSections,
  protocolProfileSectionsForSelection,
  readProtocolProfiles,
  removeProtocolProfileSections,
} from '../../features/protocol-profiles/protocolProfiles';
import './protocol-profile.css';

interface ControllerProfileSelectorProps {
  document: unknown;
  onUpdateSections: (sections: Record<string, unknown>) => void;
}

export function ControllerProfileSelector({
  document,
  onUpdateSections,
}: ControllerProfileSelectorProps) {
  const { t } = useTranslation();
  const profiles = readProtocolProfiles(document);
  const activeProfile = activeControllerProtocolProfile(document);

  if (!profiles || !activeProfile) return null;

  return (
    <section
      aria-label={t('protocolProfiles.controllerContextTitle')}
      className="controller-profile-selector"
    >
      <div className="controller-profile-selector__identity">
        <CircuitBoard aria-hidden="true" size={18} strokeWidth={1.7} />
        <div>
          <strong>{t('protocolProfiles.controllerContextTitle')}</strong>
          <small>{t('protocolProfiles.controllerContextDescription')}</small>
        </div>
      </div>
      <label className="controller-profile-selector__control">
        <span className="controller-profile-selector__label">
          {t('protocolProfiles.activeController')}
        </span>
        <select
          value={profiles.active_controller_profile_id}
          onChange={(event) =>
            onUpdateSections(
              protocolProfileSectionsForSelection(document, 'controller', event.target.value),
            )
          }
        >
          {profiles.controller_profiles.map((profile) => (
            <option key={profile.profile_id} value={profile.profile_id}>
              {profile.profile_id} · {profile.controller_family}
            </option>
          ))}
        </select>
      </label>
      <div className="controller-profile-selector__metadata">
        <span>{activeProfile.controller_family}</span>
        <span>{activeProfile.controller_revision || t('protocolProfiles.revisionUnset')}</span>
        <span>{t('protocolProfiles.count', { count: profiles.controller_profiles.length })}</span>
      </div>
      <div className="controller-profile-selector__actions">
        <button
          onClick={() => onUpdateSections(createNewProtocolProfileSections(document, 'controller'))}
          title={t('protocolProfiles.create')}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          <span>{t('protocolProfiles.create')}</span>
        </button>
        <button
          onClick={() => onUpdateSections(addProtocolProfileSections(document, 'controller'))}
          title={t('protocolProfiles.clone')}
          type="button"
        >
          <Copy aria-hidden="true" size={15} />
          <span>{t('protocolProfiles.clone')}</span>
        </button>
        <button
          className="controller-profile-selector__danger"
          disabled={profiles.controller_profiles.length <= 1}
          onClick={() => {
            if (
              window.confirm(
                t('protocolProfiles.removeConfirm', { id: activeProfile.profile_id }),
              )
            ) {
              onUpdateSections(
                removeProtocolProfileSections(document, 'controller', activeProfile.profile_id),
              );
            }
          }}
          title={t('protocolProfiles.remove')}
          type="button"
        >
          <Trash2 aria-hidden="true" size={15} />
          <span>{t('protocolProfiles.remove')}</span>
        </button>
      </div>
    </section>
  );
}
