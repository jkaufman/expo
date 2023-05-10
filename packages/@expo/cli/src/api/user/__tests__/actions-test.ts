import { asMock } from '../../../__tests__/asMock';
import { confirmAsync, promptAsync } from '../../../utils/prompts';
import { ApiV2Error } from '../../rest/client';
import { showLoginPromptAsync } from '../actions';
import { retryUsernamePasswordAuthWithOTPAsync, UserSecondFactorDeviceMethod } from '../otp';
import { loginAsync, ssoLoginAsync } from '../user';

jest.mock('../../../log');
jest.mock('../../../utils/prompts');
jest.mock('../../rest/client', () => {
  const { ApiV2Error } = jest.requireActual('../../rest/client');
  return {
    ApiV2Error,
  };
});
jest.mock('../otp');
jest.mock('../user', () => ({
  loginAsync: jest.fn(),
  ssoLoginAsync: jest.fn(),
}));

beforeEach(() => {
  asMock(promptAsync).mockClear();
  asMock(promptAsync).mockImplementation(() => {
    throw new Error('Should not be called');
  });

  asMock(loginAsync).mockClear();
  asMock(ssoLoginAsync).mockClear();
});

describe(showLoginPromptAsync, () => {
  it('prompts for OTP when 2FA is enabled', async () => {
    asMock(promptAsync)
      .mockImplementationOnce(async () => ({ username: 'hello', password: 'world' }))
      .mockImplementationOnce(async () => ({ otp: '123456' }))
      .mockImplementation(() => {
        throw new Error("shouldn't happen");
      });
    asMock(loginAsync)
      .mockImplementationOnce(async () => {
        throw new ApiV2Error({
          message: 'An OTP is required',
          code: 'ONE_TIME_PASSWORD_REQUIRED',
          metadata: {
            secondFactorDevices: [
              {
                id: 'p0',
                is_primary: true,
                method: UserSecondFactorDeviceMethod.SMS,
                sms_phone_number: 'testphone',
              },
            ],
            smsAutomaticallySent: true,
          },
        });
      })
      .mockImplementation(async () => {});

    await showLoginPromptAsync();

    expect(retryUsernamePasswordAuthWithOTPAsync).toHaveBeenCalledWith('hello', 'world', {
      secondFactorDevices: [
        {
          id: 'p0',
          is_primary: true,
          method: UserSecondFactorDeviceMethod.SMS,
          sms_phone_number: 'testphone',
        },
      ],
      smsAutomaticallySent: true,
    });
  });

  it('does not prompt if all required credentials are provided', async () => {
    asMock(promptAsync).mockImplementation(() => {
      throw new Error("shouldn't happen");
    });
    asMock(loginAsync).mockImplementation(async () => {});

    await showLoginPromptAsync({ username: 'hello', password: 'world' });
  });

  it('does not prompt whether to use SSO when called from login', async () => {
    asMock(confirmAsync).mockImplementation();
    asMock(loginAsync).mockImplementation(async () => {});
    asMock(ssoLoginAsync).mockImplementation(async () => {});

    // Regular login
    await showLoginPromptAsync({ username: 'hello', password: 'world', sso: false });
    expect(confirmAsync).not.toHaveBeenCalled();
    expect(loginAsync).toHaveBeenCalled();

    // SSO login
    await showLoginPromptAsync({ username: 'hello', password: 'world', sso: true });
    expect(confirmAsync).not.toHaveBeenCalled();
    expect(ssoLoginAsync).toHaveBeenCalled();
  });

  it('prompts whether to use SSO when the sso flag has not been set with negative confirmation', async () => {
    asMock(confirmAsync).mockResolvedValue(false);
    asMock(loginAsync).mockImplementation(async () => {});
    asMock(ssoLoginAsync).mockImplementation(async () => {});

    await showLoginPromptAsync({ username: 'hello', password: 'world' });
    expect(confirmAsync).toHaveBeenCalled();
    expect(loginAsync).toHaveBeenCalled();
    expect(ssoLoginAsync).not.toHaveBeenCalled();
  });

  it('prompts whether to use SSO when the sso flag has not been set, with positive confirmation', async () => {
    asMock(confirmAsync).mockResolvedValue(true);
    asMock(loginAsync).mockImplementation(async () => {});
    asMock(ssoLoginAsync).mockImplementation(async () => {});

    asMock(confirmAsync).mockResolvedValue(true);

    await showLoginPromptAsync({});
    expect(loginAsync).not.toHaveBeenCalled();
    expect(ssoLoginAsync).toHaveBeenCalled();
  });
});
