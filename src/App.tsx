import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';

// Role to Gender mapping for reliable voice selection
const roleToGender: Record<string, 'male' | 'female'> = {
  // Male roles
  king: 'male',
  policeman: 'male',
  police: 'male',
  'police officer': 'male',
  farmer: 'male',
  doctor: 'male',
  prince: 'male',
  emperor: 'male',
  pirate: 'male',
  knight: 'male',
  wizard: 'male',
  detective: 'male',
  man: 'male',
  boy: 'male',
  // Female roles
  queen: 'female',
  policewoman: 'female',
  teacher: 'female',
  dancer: 'female',
  singer: 'female',
  princess: 'female',
  empress: 'female',
  witch: 'female',
  actress: 'female',
  woman: 'female',
  girl: 'female',
};


const App = () => {
  // State variables
  const [originalImage, setOriginalImage] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Ref for the file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Gemini AI
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  // Load speech synthesis voices when component mounts
  useEffect(() => {
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices(); // Initial load
  }, []);


  // Text-to-speech function with language and gender support
  const speak = (text: string, lang: string, gender: 'male' | 'female' | 'neutral') => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    // 1. Get all voices for the target language
    const langVoices = voices.filter(v => v.lang === lang || v.lang.startsWith(lang.split('-')[0]));

    if (langVoices.length > 0) {
        let selectedVoice: SpeechSynthesisVoice | undefined;

        // 2. If gender is specified, try to find a matching voice
        if (gender === 'male' || gender === 'female') {
            const genderVoices = langVoices.filter(v => v.name.toLowerCase().includes(gender));
            if (genderVoices.length > 0) {
                // Prefer non-local service voices if available
                selectedVoice = genderVoices.find(v => !v.localService) || genderVoices[0];
            }
        }

        // 3. If no gender-specific voice found, or gender is neutral, find a default or first available voice for the language
        if (!selectedVoice) {
            // Prefer a default voice for the language if one exists
            selectedVoice = langVoices.find(v => v.default) || langVoices.find(v => !v.localService) || langVoices[0];
        }
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

    } else {
      console.warn(`No voice found for language: ${lang}. Using browser default.`);
    }
    
    window.speechSynthesis.speak(utterance);
  };

  // Handle image file selection
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setCurrentRole(null);
    setPrompt('');

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      const imageState = {
        base64: base64String,
        mimeType: file.type,
      };
      setOriginalImage(imageState);
      setDisplayImage(`data:${file.type};base64,${base64String}`);
    };
    reader.onerror = () => {
        setError('Failed to read the image file.');
    };
    reader.readAsDataURL(file);
  };
  
  // Trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleRoleReset = () => {
    setCurrentRole(null);
    setError(null);
    if(originalImage) {
        setDisplayImage(`data:${originalImage.mimeType};base64,${originalImage.base64}`);
    }
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim() || !originalImage) {
      setError("Please provide a role or a message.");
      return;
    }

    setIsLoading(true);
    setError(null);
    const currentPrompt = prompt;
    setPrompt(''); // Clear input for better UX

    try {
      if (!currentRole) {
        // Step 1: Transform Image based on the role
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: {
            parts: [
              {
                inlineData: {
                  data: originalImage.base64,
                  mimeType: originalImage.mimeType,
                },
              },
              {
                text: `Transform the person in the photo to embody the role of: "${currentPrompt}". Change their clothes, accessories, and background to match the role. Do not add any text or speech bubbles. Only output the transformed image.`,
              },
            ],
          },
          config: {
            responseModalities: [Modality.IMAGE],
          },
        });
        
        const part = response.candidates[0]?.content?.parts[0];
        if (part?.inlineData) {
            const newImageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            setDisplayImage(newImageData);
            setCurrentRole(currentPrompt);
        } else {
            setError("Failed to transform the image. Please try a different role.");
            setPrompt(currentPrompt); // Restore prompt on failure
        }
      } else {
        // Step 2: Get voice response for the conversation
        
        // Determine gender from the role map
        const normalizedRole = currentRole.toLowerCase().trim();
        const gender = roleToGender[normalizedRole] || 'neutral';

        // Get conversational text from Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            config: {
              systemInstruction: `You are an AI Avatar. Your current role is "${currentRole}".
You must follow these rules:
1. Stay fully in character for the role of "${currentRole}".
2. Always reply in the same language the user speaks (e.g., Hindi or English).
3. Your response will be spoken, so it should be conversational.`,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  language: {
                    type: Type.STRING,
                    description: 'The BCP-47 language tag for the response text, e.g., "en-US" for English or "hi-IN" for Hindi.',
                  },
                  response: {
                    type: Type.STRING,
                    description: 'The text of the spoken response.',
                  },
                },
                required: ["language", "response"],
              }
            },
            contents: currentPrompt,
        });

        const responseText = response.text.trim();
        const jsonString = responseText.startsWith('```json') ? responseText.slice(7, -3).trim() : responseText;

        try {
            const { language, response: textResponse } = JSON.parse(jsonString);
            if (textResponse) {
                // Speak with the predetermined gender
                speak(textResponse, language, gender);
            } else {
                setError("I'm sorry, I couldn't think of a response.");
                setPrompt(currentPrompt); // Restore prompt on failure
            }
        } catch (e) {
            console.error("Failed to parse JSON response:", responseText, e);
            // Fallback for non-JSON response
            if(responseText) {
                speak(responseText, 'en-US', gender); 
            } else {
                setError("I'm sorry, I received an invalid response.");
                setPrompt(currentPrompt);
            }
        }
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while generating the response. Please try again.');
      setPrompt(currentPrompt); // Restore prompt on error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container" role="main">
      <header>
        <h1>AI Avatar</h1>
        <p>Your photo, your persona.</p>
      </header>
      
      <div className="avatar-display" aria-live="polite">
        {isLoading && (
          <div className="loader" role="status" aria-label="Loading new avatar">
            <div className="spinner"></div>
          </div>
        )}
        {displayImage ? (
          <img src={displayImage} alt="User's avatar" />
        ) : (
           <div className="upload-section">
            <p>Upload a photo to begin</p>
           </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageChange}
        accept="image/png, image/jpeg, image/webp"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      
      {originalImage ? (
        <div className="action-area">
          <form className="chat-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={currentRole ? `Ask the ${currentRole}...` : "Make me a queen..."}
              disabled={isLoading}
              aria-label={currentRole ? `Ask the ${currentRole}` : "Enter a new role"}
              required
            />
            <button type="submit" className="btn" disabled={isLoading}>
              {isLoading ? 'Thinking...' : (currentRole ? 'Ask' : 'Transform')}
            </button>
          </form>
          {currentRole && !isLoading && (
            <button className="btn btn-secondary" onClick={handleRoleReset}>
                Change Role
            </button>
          )}
        </div>
      ) : (
         <button className="btn" onClick={triggerFileInput}>
            Upload Photo
         </button>
      )}

      {error && <div className="error-message" role="alert">{error}</div>}
    </div>
  );
};

export default App;