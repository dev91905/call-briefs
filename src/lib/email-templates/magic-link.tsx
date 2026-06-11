import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  token?: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  token,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{token ? `${token} is your ${siteName} sign-in code` : `Your login code for ${siteName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your sign-in code</Heading>
        <Text style={text}>
          Enter this 6-digit code in {siteName} to finish signing in.
        </Text>
        {token ? <Text style={codeStyle}>{token}</Text> : null}
        <Text style={helperText}>
          If you prefer, you can also continue with the secure link below.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Continue securely
        </Button>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this email, you can safely ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
   margin: '0 0 18px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '34px',
  fontWeight: 'bold' as const,
  letterSpacing: '0.28em',
  color: '#000000',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}
const helperText = {
  fontSize: '12px',
  color: '#777777',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
